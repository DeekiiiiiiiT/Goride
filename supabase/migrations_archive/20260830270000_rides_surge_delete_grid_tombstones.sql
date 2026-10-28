-- Delete inert legacy grid: surge tombstones (H3 cutover complete; dual-read removed in edge).

DELETE FROM rides.surge_cells
WHERE cell_key LIKE 'grid:%';
