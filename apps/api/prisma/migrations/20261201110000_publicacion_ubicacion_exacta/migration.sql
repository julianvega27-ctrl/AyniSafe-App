-- P7 (decision del 27/11/2026, documento 11 §5): el mapa publico muestra la ubicacion exacta del reporte
-- en lugar del centro de una celda de 300 m. Se renombran las columnas de la instantanea; las filas
-- publicadas antes conservan el centro de celda guardado hasta que se republiquen.
ALTER TABLE publicaciones_incidente RENAME COLUMN celda_lat TO latitud;
ALTER TABLE publicaciones_incidente RENAME COLUMN celda_lon TO longitud;
ALTER TABLE publicaciones_incidente RENAME CONSTRAINT publicaciones_incidente_celda_lat_check TO publicaciones_incidente_latitud_check;
ALTER TABLE publicaciones_incidente RENAME CONSTRAINT publicaciones_incidente_celda_lon_check TO publicaciones_incidente_longitud_check;
