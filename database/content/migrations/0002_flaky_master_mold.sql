CREATE UNIQUE INDEX cms_module_number ON cms_modules (course_id, json_extract(metadata_json, '$.number'));
