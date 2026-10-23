"""Read-only OOXML inventory. No Office, AI service, or third-party Python package required."""
import argparse
import hashlib
import json
import posixpath
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

NS = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
      'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
REL = '{http://schemas.openxmlformats.org/package/2006/relationships}'


def relationships(archive, part):
    parent, name = posixpath.split(part)
    relpart = posixpath.join(parent, '_rels', name + '.rels')
    if relpart not in archive.namelist():
        return {}
    result = {}
    for rel in ET.fromstring(archive.read(relpart)):
        target = rel.get('Target', '')
        external = rel.get('TargetMode') == 'External'
        resolved = target if external else posixpath.normpath(posixpath.join(parent, target))
        if not external and (resolved.startswith('../') or resolved.startswith('/')):
            raise ValueError('Unsafe relationship target')
        result[rel.get('Id')] = {'part': resolved, 'external': external, 'type': rel.get('Type', '').rsplit('/', 1)[-1]}
    return result


def paragraphs(shape):
    result = []
    for index, paragraph in enumerate(shape.findall('./p:txBody/a:p', NS)):
        text = ''.join('\n' if item.tag == '{' + NS['a'] + '}br' else item.text or ''
                       for item in paragraph.iter() if item.tag in ('{' + NS['a'] + '}t', '{' + NS['a'] + '}br'))
        props = paragraph.find('a:pPr', NS)
        result.append({'index': index, 'text': text,
                       'level': int(props.get('lvl', '0')) if props is not None else 0,
                       'bullet': props is not None and (props.find('a:buChar', NS) is not None or props.find('a:buAutoNum', NS) is not None)})
    return result


def shapes(root):
    result = []
    for element in root.findall('.//p:sp', NS):
        ident = element.find('./p:nvSpPr/p:cNvPr', NS)
        placeholder = element.find('./p:nvSpPr/p:nvPr/p:ph', NS)
        offset = element.find('./p:spPr/a:xfrm/a:off', NS)
        extent = element.find('./p:spPr/a:xfrm/a:ext', NS)
        result.append({'id': ident.get('id'), 'name': ident.get('name', ''),
                       'placeholder': placeholder.get('type', 'obj') if placeholder is not None else None,
                       'x': int(offset.get('x')) if offset is not None else 0,
                       'y': int(offset.get('y')) if offset is not None else 0,
                       'width': int(extent.get('cx')) if extent is not None else 0,
                       'height': int(extent.get('cy')) if extent is not None else 0,
                       'paragraphs': paragraphs(element)})
    return result


def extract(source):
    source = Path(source)
    with zipfile.ZipFile(source) as archive:
        entries = archive.infolist()
        if len(entries) > 20000 or sum(item.file_size for item in entries) > 256 * 1024 * 1024:
            raise ValueError('Presentation exceeds local extraction limits')
        if any(item.file_size > 32 * 1024 * 1024 for item in entries):
            raise ValueError('Presentation part exceeds 32 MiB')
        presentation = ET.fromstring(archive.read('ppt/presentation.xml'))
        rels = relationships(archive, 'ppt/presentation.xml')
        order = presentation.findall('./p:sldIdLst/p:sldId', NS)
        if len(order) > 2000:
            raise ValueError('Presentation exceeds 2000 slides')
        slides = []
        for number, item in enumerate(order, 1):
            part = rels[item.get('{' + NS['r'] + '}id')]
            if part['external'] or not re.fullmatch(r'ppt/slides/[^/]+\.xml', part['part']):
                raise ValueError('Invalid slide relationship')
            root = ET.fromstring(archive.read(part['part']))
            slide_rels = relationships(archive, part['part'])
            pictures = []
            for picture in root.findall('.//p:pic', NS):
                blip = picture.find('.//a:blip', NS)
                reference = blip.get('{' + NS['r'] + '}embed') if blip is not None else None
                pictures.append(slide_rels.get(reference, {'external': True, 'part': 'unresolved'}))
            note_shapes = []
            for relation in slide_rels.values():
                if relation['type'] == 'notesSlide' and not relation['external']:
                    note_shapes = shapes(ET.fromstring(archive.read(relation['part'])))
            unsupported = []
            for tag in ['graphicFrame', 'grpSp', 'oleObj', 'contentPart']:
                if root.findall('.//p:' + tag, NS):
                    unsupported.append(tag)
            connectors = len(root.findall('.//p:cxnSp', NS))
            slides.append({'number': number, 'part': part['part'], 'hidden': root.get('show') == '0',
                           'shapes': shapes(root), 'pictures': pictures, 'notes': note_shapes,
                           'connectors': connectors, 'unsupported': unsupported})
        media = [{'part': item.filename, 'bytes': item.file_size,
                  'sha256': hashlib.sha256(archive.read(item.filename)).hexdigest()}
                 for item in entries if item.filename.startswith('ppt/media/') and not item.is_dir()]
        return {'format': 'novoapps-pptx-inventory-1', 'filename': source.name,
                'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'slides': slides, 'media': media}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pptx')
    parser.add_argument('--out', required=True)
    arguments = parser.parse_args()
    inventory = extract(arguments.pptx)
    target = Path(arguments.out)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'slides': len(inventory['slides']), 'sha256': inventory['sha256'], 'out': str(target)}))
