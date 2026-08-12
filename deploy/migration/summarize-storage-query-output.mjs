let input = '';
for await (const chunk of process.stdin) input += chunk;
const response = JSON.parse(input.replace(/^\uFEFF/, ''));
const rows = Array.isArray(response.rows) ? response.rows : [];
const items = rows.map(row => JSON.parse(Object.values(row)[0]));
const counts = items.reduce((result, item) => {
  result[item.classification] = (result[item.classification] ?? 0) + 1;
  return result;
}, {});
process.stdout.write(`${JSON.stringify({
  rows: items.length,
  confirmed: Object.entries(counts)
    .filter(([name]) => name.startsWith('confirmed_'))
    .reduce((sum, [, count]) => sum + count, 0),
  counts,
})}\n`);
