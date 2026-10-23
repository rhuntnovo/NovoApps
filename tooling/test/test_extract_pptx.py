import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile
import sys

sys.dont_write_bytecode = True

loader = importlib.util.spec_from_file_location('extract_pptx', Path(__file__).resolve().parents[1] / 'extract-pptx.py')
module = importlib.util.module_from_spec(loader)
loader.loader.exec_module(module)


class ExtractTest(unittest.TestCase):
    def test_relationship_order_unicode_and_soft_breaks(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / 'source.pptx'
            with zipfile.ZipFile(target, 'w') as archive:
                archive.writestr('ppt/presentation.xml', '<p:presentation xmlns:p="' + module.NS['p'] + '" xmlns:r="' + module.NS['r'] + '"><p:sldIdLst><p:sldId r:id="b"/><p:sldId r:id="a"/></p:sldIdLst></p:presentation>')
                archive.writestr('ppt/_rels/presentation.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="a" Target="slides/slide1.xml"/><Relationship Id="b" Target="slides/slide2.xml"/></Relationships>')
                xml = '<p:sld xmlns:p="'+module.NS['p']+'" xmlns:a="'+module.NS['a']+'"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="1" name="Text"/><p:nvPr/></p:nvSpPr><p:txBody><a:p><a:r><a:t>God’s Word</a:t></a:r><a:br/><a:r><a:t>Exact – text.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'
                archive.writestr('ppt/slides/slide1.xml', xml)
                archive.writestr('ppt/slides/slide2.xml', xml.replace('God’s Word', 'Second slide'))
            result = module.extract(target)
            self.assertEqual(result['slides'][0]['part'], 'ppt/slides/slide2.xml')
            self.assertEqual(result['slides'][1]['shapes'][0]['paragraphs'][0]['text'], 'God’s Word\nExact – text.')
            self.assertEqual(result['slides'][1]['number'], 2)
            self.assertEqual(len(result['sha256']), 64)


if __name__ == '__main__':
    unittest.main()
