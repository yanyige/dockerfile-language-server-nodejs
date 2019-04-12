import * as child_process from 'child_process';
import * as util from 'util';
import {
  Position, Range,
	TextDocumentSyncKind, MarkupKind, SymbolKind, InsertTextFormat, CompletionItemKind, CodeActionKind, DiagnosticSeverity, FoldingRangeKind, DocumentHighlightKind
} from 'vscode-languageserver';
import { CommandIds } from 'dockerfile-language-service';
import { ValidationCode } from 'dockerfile-utils';

let lspProcess = child_process.fork('out/src/server.js', [ "--node-ipc" ]);
let messageId = 1;
const routers = {} as any;

lspProcess.on('message', function (json) {
  const ret = JSON.stringify(json, null, 4);
  console.log('=====================messsage from server=====================\n', ret);
  console.log('===================messsage from server end======================');
});

routers.initialize0 = () => {
  initialize(false);
}

routers.initialize = () => {
  initialize(true);
}

routers.initialized = () => {
  sendNotification("initialized", {});
};

routers.shutdown = () => {
  sendRequest("shutdown", {});
};

routers.exit = () => {
  sendNotification("exit", {});
};

routers.didOpen = () => {
  sendNotification("textDocument/didOpen", {
    textDocument: {
      languageId: "dockerfile",
      version: 1,
      uri: "uri://dockerfile/x.txt",
      text: "from node"
    }
  });
}

routers.codeAction = () => {
  initialize(true, {
    codeActionLiteralSupport: {
      codeActionKind: {
        valueSet: [
          CodeActionKind.QuickFix
        ]
      }
    }
  });
  sendNotification("textDocument/didOpen", {
    textDocument: {
      languageId: "dockerfile",
      version: 1,
      uri: "uri://dockerfile/x.txt",
      text: "from node"
    }
  });
  sendRequest("textDocument/codeAction", {
    textDocument: {
      uri: "uri://dockerfile/x.txt"
    },
    context: {
      diagnostics: [
        {
          code: ValidationCode.CASING_INSTRUCTION,
          range: {
            start: {
              line: 0,
              character: 0
            },
            end: {
              line: 0,
              character: 4
            }
          }
        }
      ]
    }
  });
}

routers.hover = () => sendRequest("textDocument/hover", {
  textDocument: {
    uri: "uri://dockerfile/x.txt"
  },
  position: {
    line: 0,
    character: 1
  }
});

routers.completion = () => {
  sendNotification("textDocument/didOpen", {
    textDocument: {
      languageId: "dockerfile",
      version: 1,
      uri: "uri://dockerfile/207.txt",
      text: "FRO"
    }
  });
  let id2 = -1;
  const id = sendRequest("textDocument/completion", {
    textDocument: {
      uri: "uri://dockerfile/207.txt"
    },
    position: {
      line: 0,
      character: 3
    }
  });
  const listener207 = (json) => {
    if (json.id === id) {
      id2 = sendRequest("completionItem/resolve", json.result[0]);
    } else if (json.id === id2) {
      lspProcess.removeListener("message", listener207);
      sendNotification("textDocument/didClose", {
        textDocument: {
          uri: "uri://dockerfile/207.txt"
        }
      });
    }
  };
  lspProcess.on("message", listener207);
}

routers.changeContent = () => {
  sendNotification("textDocument/didChange", {
    textDocument: {
      uri: "uri://dockerfile/x.txt",
      version: 2
    },
    contentChanges: [
      {
        text: "FROM node"
      }
    ]
  });
}

routers.executeCommandUPPERCASE = () => sendRequest("workspace/executeCommand", {
  command: CommandIds.UPPERCASE,
  arguments: [
    "uri://dockerfile/x.txt",
    {
      start: {
        line: 0,
        character: 0
      },
      end: {
        line: 0,
        character: 4
      }
    }
  ]
});

function sendRequest(method: string, params: any): number {
  let message = {
    jsonrpc: "2.0",
		id: messageId++,
		method: method,
		params: params
  };
  lspProcess.send(message);
  const ret = JSON.stringify(message, null, 4);
  console.log('=====================request=====================\n', ret);
  console.log('==================request end=====================\n');
	return messageId - 1;
}

function sendNotification(method: string, params: any) {
  let message = {
    jsonrpc: "2.0",
		method: method,
		params: params
	};
  lspProcess.send(message);
  const ret = JSON.stringify(message, null, 4);
  console.log('=====================notification=====================\n', ret);
  console.log('==================notification end=====================\n');
}


function initialize(applyEdit: boolean, codeAction?: any, rename?: any): number {
	return initializeCustomCapabilities({
		textDocument: {
			completion: {
				completionItem: {
					deprecatedSupport: true,
					documentationFormat: [ MarkupKind.Markdown ],
					snippetSupport: true
				}
			},
			hover: {
				contentFormat: [ MarkupKind.PlainText ]
			},
			codeAction,
			rename
		},
		workspace: {
			applyEdit: applyEdit,
			workspaceEdit: {
				documentChanges: true
			}
		}
	});
}

function initializeCustomCapabilities(capabilities: any): number {
  const req = {
		rootPath: process.cwd(),
		processId: process.pid,
		capabilities
  };
	return sendRequest("initialize", req);
}

process.stdin.setEncoding('utf8');
process.stdin.on('readable', function() {
  var chunk = process.stdin.read();
  if (chunk !== null) {
    const stdin = chunk.toString().trim();
    process.stdout.write(util.format('输入的命令:%s\n', stdin));
    if (chunk) {
      try {
        routers[stdin]();
      } catch (error) {
        console.log('请输入正确的命令', error);
      }
    }
  }
});

process.stdin.on('end', function() {
  process.stdout.write('end');
});
