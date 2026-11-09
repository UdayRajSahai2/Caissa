const USERNAME = /^[A-Za-z0-9_-]{3,25}$/;

export function isValidChessComUsername(value: string): boolean {
  return USERNAME.test(value);
}
