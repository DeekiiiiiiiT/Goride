-- R14. Dashboard function-list query runs as postgres; default work_mem spills to disk.
alter role postgres set work_mem = 32768;
