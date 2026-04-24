export function buildApiKeyFromCookies(authToken: string, ct0: string): string {
  const cookies = [
    { name: 'auth_token', value: authToken, domain: '.x.com', path: '/' },
    { name: 'ct0', value: ct0, domain: '.x.com', path: '/' },
  ];

  return Buffer.from(JSON.stringify(cookies)).toString('base64');
}
