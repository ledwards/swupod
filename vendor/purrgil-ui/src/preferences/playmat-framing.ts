/** Project a photographed mat's four corners onto a flat surface at its printed aspect ratio.
 * This is presentation metadata: original artwork bytes remain untouched.
 */
export function playmatProjection(corners: readonly number[][], aspectRatio=1000/600): string {
  const height = 1000/aspectRatio;
  const target = [[0, 0], [1000, 0], [1000, height], [0, height]];
  const rows = corners.flatMap(([x, y], i) => {
    const [u, v] = target[i];
    return [[x, y, 1, 0, 0, 0, -u*x, -u*y, u], [0, 0, 0, x, y, 1, -v*x, -v*y, v]];
  });
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col+1; row < 8; row++) if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const divisor = rows[col][col];
    if (Math.abs(divisor) < 1e-9) throw new Error('Invalid playmat corners');
    rows[col] = rows[col].map(n => n/divisor);
    for (let row = 0; row < 8; row++) if (row !== col) {
      const factor = rows[row][col];
      rows[row] = rows[row].map((n, i) => n-factor*rows[col][i]);
    }
  }
  const [a,b,c,d,e,f,g,h] = rows.map(row => row[8]);
  return `matrix3d(${[a,d,0,g,b,e,0,h,0,0,1,0,c,f,0,1].join(',')})`;
}
