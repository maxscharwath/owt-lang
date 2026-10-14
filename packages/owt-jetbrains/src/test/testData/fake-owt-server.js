// Minimal stand-in for @owt/language-server used by OwtLspIntegrationTest.
// Speaks LSP over stdio and reports what it received from the IDE as a diagnostic.
'use strict';

let buffer = Buffer.alloc(0);
let initializationOptions = null;

function send(message) {
  const json = JSON.stringify({ jsonrpc: '2.0', ...message });
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`);
}

function handle(message) {
  switch (message.method) {
    case 'initialize':
      initializationOptions = message.params.initializationOptions ?? null;
      send({ id: message.id, result: { capabilities: { textDocumentSync: 1 }, serverInfo: { name: 'fake-owt' } } });
      break;
    case 'textDocument/didOpen': {
      const doc = message.params.textDocument;
      send({
        method: 'textDocument/publishDiagnostics',
        params: {
          uri: doc.uri,
          diagnostics: [{
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
            severity: 1,
            source: 'fake-owt',
            message: `fake-owt languageId=${doc.languageId} args=${process.argv.slice(2).join(' ')} init=${JSON.stringify(initializationOptions)}`,
          }],
        },
      });
      break;
    }
    case 'shutdown':
      send({ id: message.id, result: null });
      break;
    case 'exit':
      process.exit(0);
      break;
    default:
      if (message.id !== undefined && message.method) send({ id: message.id, result: null });
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd < 0) return;
    const match = /Content-Length: *(\d+)/i.exec(buffer.subarray(0, headerEnd).toString('ascii'));
    const length = match ? Number(match[1]) : 0;
    if (buffer.length < headerEnd + 4 + length) return;
    const body = buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString('utf8');
    buffer = buffer.subarray(headerEnd + 4 + length);
    handle(JSON.parse(body));
  }
});
