DROP TABLE IF EXISTS cross_reference CASCADE;
DROP TABLE IF EXISTS drawing_item CASCADE;
DROP TABLE IF EXISTS drawing CASCADE;
DROP TABLE IF EXISTS assembly_component CASCADE;
DROP TABLE IF EXISTS part_application CASCADE;
DROP TABLE IF EXISTS vehicle_application CASCADE;
DROP TABLE IF EXISTS part CASCADE;
DROP TABLE IF EXISTS product_group CASCADE;
DROP TABLE IF EXISTS manufacturer CASCADE;
DROP TABLE IF EXISTS asset CASCADE;
DROP TABLE IF EXISTS catalog CASCADE;

CREATE TABLE catalog (
  catalog_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_format TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  source_checksum TEXT NOT NULL
);

CREATE TABLE asset (
  catalog_id TEXT NOT NULL REFERENCES catalog(catalog_id),
  asset_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'drawing')),
  path TEXT NOT NULL,
  content_type TEXT NOT NULL,
  PRIMARY KEY (catalog_id, asset_id)
);

CREATE TABLE manufacturer (
  catalog_id TEXT NOT NULL REFERENCES catalog(catalog_id),
  manufacturer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  used_for_vehicles BOOLEAN NOT NULL,
  used_for_cross_reference BOOLEAN NOT NULL,
  application_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (catalog_id, manufacturer_id)
);

CREATE TABLE product_group (
  catalog_id TEXT NOT NULL REFERENCES catalog(catalog_id),
  group_id TEXT NOT NULL,
  parent_group_id TEXT,
  description TEXT NOT NULL,
  PRIMARY KEY (catalog_id, group_id),
  FOREIGN KEY (catalog_id, parent_group_id) REFERENCES product_group(catalog_id, group_id)
);

CREATE TABLE part (
  catalog_id TEXT NOT NULL REFERENCES catalog(catalog_id),
  part_id TEXT NOT NULL,
  part_number TEXT NOT NULL,
  part_number_normalized TEXT NOT NULL,
  description TEXT NOT NULL,
  is_obsolete BOOLEAN NOT NULL,
  group_id TEXT,
  subgroup_id TEXT,
  photo_id TEXT,
  note TEXT,
  drawing_id TEXT,
  is_assembly BOOLEAN NOT NULL,
  PRIMARY KEY (catalog_id, part_id),
  UNIQUE (catalog_id, part_number),
  FOREIGN KEY (catalog_id, group_id) REFERENCES product_group(catalog_id, group_id),
  FOREIGN KEY (catalog_id, subgroup_id) REFERENCES product_group(catalog_id, group_id),
  FOREIGN KEY (catalog_id, photo_id) REFERENCES asset(catalog_id, asset_id)
);

CREATE TABLE vehicle_application (
  catalog_id TEXT NOT NULL REFERENCES catalog(catalog_id),
  application_id TEXT NOT NULL,
  manufacturer_id TEXT,
  description TEXT NOT NULL,
  year_from INTEGER,
  year_to INTEGER,
  year_text TEXT,
  PRIMARY KEY (catalog_id, application_id),
  FOREIGN KEY (catalog_id, manufacturer_id) REFERENCES manufacturer(catalog_id, manufacturer_id)
);

CREATE TABLE part_application (
  catalog_id TEXT NOT NULL,
  part_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  PRIMARY KEY (catalog_id, part_id, application_id),
  FOREIGN KEY (catalog_id, part_id) REFERENCES part(catalog_id, part_id),
  FOREIGN KEY (catalog_id, application_id) REFERENCES vehicle_application(catalog_id, application_id)
);

CREATE TABLE assembly_component (
  catalog_id TEXT NOT NULL,
  assembly_part_id TEXT NOT NULL,
  component_part_id TEXT NOT NULL,
  drawing_item TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  PRIMARY KEY (catalog_id, assembly_part_id, component_part_id, drawing_item),
  FOREIGN KEY (catalog_id, assembly_part_id) REFERENCES part(catalog_id, part_id),
  FOREIGN KEY (catalog_id, component_part_id) REFERENCES part(catalog_id, part_id)
);

CREATE TABLE drawing (
  catalog_id TEXT NOT NULL,
  drawing_id TEXT NOT NULL,
  title TEXT,
  asset_id TEXT,
  PRIMARY KEY (catalog_id, drawing_id),
  FOREIGN KEY (catalog_id, asset_id) REFERENCES asset(catalog_id, asset_id)
);

CREATE TABLE drawing_item (
  catalog_id TEXT NOT NULL,
  drawing_id TEXT NOT NULL,
  item TEXT NOT NULL,
  label TEXT,
  PRIMARY KEY (catalog_id, drawing_id, item),
  FOREIGN KEY (catalog_id, drawing_id) REFERENCES drawing(catalog_id, drawing_id)
);

CREATE TABLE cross_reference (
  catalog_id TEXT NOT NULL,
  cross_reference_id TEXT NOT NULL,
  part_id TEXT NOT NULL,
  foreign_manufacturer_id TEXT NOT NULL,
  foreign_number TEXT NOT NULL,
  foreign_number_normalized TEXT NOT NULL,
  PRIMARY KEY (catalog_id, cross_reference_id),
  FOREIGN KEY (catalog_id, part_id) REFERENCES part(catalog_id, part_id),
  FOREIGN KEY (catalog_id, foreign_manufacturer_id) REFERENCES manufacturer(catalog_id, manufacturer_id)
);

CREATE INDEX idx_part_application_application ON part_application(catalog_id, application_id);
CREATE INDEX idx_vehicle_application_make_model ON vehicle_application(catalog_id, manufacturer_id, description);
CREATE INDEX idx_cross_reference_number ON cross_reference(catalog_id, foreign_number_normalized);
