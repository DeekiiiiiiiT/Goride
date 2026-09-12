-- entry_id collisions across fleet.ledger_entries union
SELECT entry_id, count(*) AS n
FROM fleet.ledger_entries
GROUP BY entry_id
HAVING count(*) > 1
ORDER BY n DESC
LIMIT 100;
