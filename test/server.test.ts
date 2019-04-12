/* --------------------------------------------------------------------------------------------
 * Copyright (c) Remy Suen. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as child_process from "child_process";
import * as assert from "assert";

import {
	Position, Range,
	TextDocumentSyncKind, MarkupKind, SymbolKind, InsertTextFormat, CompletionItemKind, CodeActionKind, DiagnosticSeverity, FoldingRangeKind, DocumentHighlightKind
} from 'vscode-languageserver';
import { CommandIds } from 'dockerfile-language-service';
import { ValidationCode } from 'dockerfile-utils';

// fork the server and connect to it using Node IPC
let lspProcess = child_process.fork("out/src/server.js", [ "--node-ipc" ]);
let messageId = 1;

function sendRequest(method: string, params: any): number {
	let message = {
		jsonrpc: "2.0",
		id: messageId++,
		method: method,
		params: params
	};
	lspProcess.send(message);
	return messageId - 1;
}

function sendNotification(method: string, params: any) {
	let message = {
		jsonrpc: "2.0",
		method: method,
		params: params
	};
	lspProcess.send(message);
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
	return sendRequest("initialize", {
		rootPath: process.cwd(),
		processId: process.pid,
		capabilities
	});
}

describe("Dockerfile LSP Tests", function() {
	it("initialize", function(finished) {
		this.timeout(5000);
		const responseId = initialize(false);
		lspProcess.once('message', function (json) {
			assert.equal(json.id, responseId);
			let capabilities = json.result.capabilities;
			assert.equal(capabilities.textDocumentSync, TextDocumentSyncKind.Incremental);
			assert.equal(capabilities.codeActionProvider, false);
			assert.equal(capabilities.completionProvider.resolveProvider, true);
			assert.equal(capabilities.executeCommandProvider, undefined);
			assert.equal(capabilities.foldingRangeProvider, true);
			assert.equal(capabilities.hoverProvider, true);
			assert.equal(capabilities.renameProvider, true);
			assert.equal(capabilities.renameProvider.prepareProvider, undefined);
			finished();
		});
	});

	it("initialize", function (finished) {
		this.timeout(5000);
		const responseId = initialize(false, {}, { prepareSupport: false });
		lspProcess.once('message', function (json) {
			assert.equal(json.id, responseId);
			let capabilities = json.result.capabilities;
			assert.equal(capabilities.textDocumentSync, TextDocumentSyncKind.Incremental);
			assert.equal(capabilities.codeActionProvider, false);
			assert.equal(capabilities.completionProvider.resolveProvider, true);
			assert.equal(capabilities.executeCommandProvider, undefined);
			assert.equal(capabilities.foldingRangeProvider, true);
			assert.equal(capabilities.hoverProvider, true);
			assert.equal(capabilities.renameProvider, true);
			assert.equal(capabilities.renameProvider.prepareProvider, undefined);
			finished();
		});
	});

	it("initialize", function (finished) {
		this.timeout(5000);
		const responseId = initialize(false, {}, { prepareSupport: true });
		lspProcess.once('message', function (json) {
			assert.equal(json.id, responseId);
			let capabilities = json.result.capabilities;
			assert.equal(capabilities.textDocumentSync, TextDocumentSyncKind.Incremental);
			assert.equal(capabilities.codeActionProvider, false);
			assert.equal(capabilities.completionProvider.resolveProvider, true);
			assert.equal(capabilities.executeCommandProvider, undefined);
			assert.equal(capabilities.foldingRangeProvider, true);
			assert.equal(capabilities.hoverProvider, true);
			assert.equal(capabilities.renameProvider.prepareProvider, true);
			finished();
		});
	});

	it("initialized", function () {
		sendNotification("initialized", {});
	});

	it("issue #183", function(finished) {
		this.timeout(5000);
		sendNotification("textDocument/didOpen", {
			textDocument: {
				languageId: "dockerfile",
				version: 1,
				uri: "uri://dockerfile/x.txt",
				text: "from node"
			}
		});

		const codeActionResponseId = sendRequest("textDocument/codeAction", {
			textDocument: {
				uri: "uri://dockerfile/x.txt"
			},
			context: {
				diagnostics: [
					{
						code: ValidationCode.CASING_INSTRUCTION
					}
				]
			}
		});
		const codeActionListener = function (json) {
			if (json.id === codeActionResponseId) {
				assert.ok(Array.isArray(json.result));
				assert.equal(json.result.length, 0);
				lspProcess.removeListener("message", codeActionListener);
			}
		};
		lspProcess.on("message", codeActionListener);

		const executeCommandResponseId = sendRequest("workspace/executeCommand", {
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
		const executeCommandListener = function (json) {
			if (json.method === "workspace/applyEdit") {
				throw new Error("workspace/applyEdit method received");
			} else if (json.id === executeCommandResponseId) {
				lspProcess.removeListener("message", executeCommandListener);
				finished();
			}
		};
		lspProcess.on("message", executeCommandListener);
	});

	it("issue #209", function(finished) {
		this.timeout(5000);
		let id = sendRequest("textDocument/hover", {
			textDocument: {
				uri: "uri://dockerfile/x.txt"
			},
			position: {
				line: 0,
				character: 1
			}
		});
		lspProcess.on("message", (json) => {
			if (json.id === id) {
				assert.equal(json.result.contents.kind, MarkupKind.PlainText);
				finished();
			}
		});
	});

	it("issue #202", function(finished) {
		this.timeout(5000);
		initialize(true);
		const executeCommandResponseId = sendRequest("workspace/executeCommand", {
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
		lspProcess.on("message", (json) => {
			if (json.method === "workspace/applyEdit") {
				console.log('json', json);
				assert.equal(json.params.edit.documentChanges.length, 1);
				finished();
			}
		});
	});

	it("issue #214", function(finished) {
		this.timeout(5000);
		sendNotification("textDocument/didClose", {
			textDocument: {
				uri: "uri://dockerfile/x.txt",
			}
		});

		lspProcess.once("message", (json) => {
			if (json.method === "textDocument/publishDiagnostics") {
				assert.equal(json.params.uri, "uri://dockerfile/x.txt");
				assert.equal(json.params.diagnostics.length, 0);
				finished();
			}
		});
	});

	it("issue #216", function (finished) {
		this.timeout(5000);
		sendNotification("textDocument/didOpen", {
			textDocument: {
				languageId: "dockerfile",
				version: 1,
				uri: "uri://dockerfile/216.txt",
				text: "FROM node\nVOLUME \nARG arg"
			}
		});

		lspProcess.once("message", (json) => {
			if (json.method === "textDocument/publishDiagnostics") {
				sendNotification("textDocument/didChange", {
					textDocument: {
						version: 2,
						uri: "uri://dockerfile/216.txt",
					},
					contentChanges: [
						{
							range: {
								start: {
									line: 1,
									character: 7
								},
								end: {
									line: 1,
									character: 7
								}
							},
							rangeLength: 0,
							text: "/"
						},
						{
							range: {
								start: {
									line: 1,
									character: 8
								},
								end: {
									line: 1,
									character: 8
								}
							},
							rangeLength: 0,
							text: "t"
						},
						{
							range: {
								start: {
									line: 1,
									character: 9
								},
								end: {
									line: 1,
									character: 9
								}
							},
							rangeLength: 0,
							text: "m"
						},
						{
							range: {
								start: {
									line: 1,
									character: 10
								},
								end: {
									line: 1,
									character: 10
								}
							},
							rangeLength: 0,
							text: "p"
						}
					]
				});
				lspProcess.once("message", (json) => {
					if (json.method === "textDocument/publishDiagnostics") {
						assert.equal(json.params.uri, "uri://dockerfile/216.txt");
						assert.equal(json.params.diagnostics.length, 0);
						sendNotification("textDocument/didClose", {
							textDocument: {
								uri: "uri://dockerfile/216.txt"
							}
						});
						finished();
					}
				});
			}
		});
	});

	it("issue #207", function(finished) {
		this.timeout(5000);
		sendNotification("textDocument/didOpen", {
			textDocument: {
				languageId: "dockerfile",
				version: 1,
				uri: "uri://dockerfile/207.txt",
				text: "FRO"
			}
		});
		let id2 = -1;
		let id = sendRequest("textDocument/completion", {
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
				assert.equal(json.result.documentation.kind, MarkupKind.Markdown);
				lspProcess.removeListener("message", listener207);
				sendNotification("textDocument/didClose", {
					textDocument: {
						uri: "uri://dockerfile/207.txt"
					}
				});
				finished();
			}
		};
		lspProcess.on("message", listener207);
	});

	function test218(fileName: string, initialSeverity: string, severity: string, callback: Function) {
		const document = {
			languageId: "dockerfile",
			version: 1,
			uri: "uri://dockerfile/" + fileName,
			text: "FROM node\nRUN ['a']"
		};

		let first = true;
		const listener218 = (json) => {
			if (json.method === "textDocument/publishDiagnostics" &&
					json.params.uri === document.uri) {
				if (first) {
					if (initialSeverity === "ignore") {
						assert.equal(json.params.diagnostics.length, 0);
					} else {
						assert.equal(json.params.diagnostics.length, 1);
						assert.equal(json.params.diagnostics[0].severity, DiagnosticSeverity.Warning);
					}
					first = false;

					if (severity === null) {
						sendNotification("workspace/didChangeConfiguration", {
							settings: {
							}
						});
					} else {
						sendNotification("workspace/didChangeConfiguration", {
							settings: {
								docker: {
									languageserver: {
										diagnostics: {
											instructionJSONInSingleQuotes: severity
										}
									}
								}
							}
						});
					}
				} else {
					lspProcess.removeListener("message", listener218);
					if (severity === "ignore") {
						assert.equal(json.params.diagnostics.length, 0);
					} else {
						if (severity === "error") {
							assert.equal(json.params.diagnostics[0].severity, DiagnosticSeverity.Error);
						} else {
							assert.equal(json.params.diagnostics[0].severity, DiagnosticSeverity.Warning);
						}
						assert.equal(json.params.diagnostics.length, 1);
					}
					sendNotification("textDocument/didClose", {
						textDocument: {
							uri: "uri://dockerfile/218.txt"
						}
					});
					callback();
				}
			}
		};
		lspProcess.on("message", listener218);

		if (initialSeverity === null) {
			sendNotification("workspace/didChangeConfiguration", {
				settings: {
				}
			});
		} else {
			sendNotification("workspace/didChangeConfiguration", {
				settings: {
					docker: {
						languageserver: {
							diagnostics: {
								instructionJSONInSingleQuotes: initialSeverity
							}
						}
					}
				}
			});
		}
		sendNotification("textDocument/didOpen", {
			textDocument: document
		});
	}

	describe("issue #218", function() {
		/**
		 * 1. Start by sending in a "null" configuration as a default.
		 * 2. Confirm that a diagnostic is received ("null" should default to "warning").
		 * 3. Send in an "ignore" configruation.
		 * 4. COnfirm that no diagnostic is received.
		 */
		it("null to ignore configuration", function(finished) {
			this.timeout(5000);
			test218("218-null-to-ignore", null, "ignore", finished);
		});
	
		/**
		 * 1. Start by sending in a configuration to "ignore" the diagnostic.
		 * 2. Confirm that no diagnostic is received.
		 * 3. Send in a "null" configuration.
		 * 4. COnfirm that a diagnostic is received (as it should default to "warning").
		 */
		it("ignore to null configuration", function(finished) {
			this.timeout(5000);
			test218("218-ignore-to-null", "ignore", null, finished);
		});
	
		/**
		 * 1. Start by sending in a configuration to "ignore" the diagnostic.
		 * 2. Confirm that no diagnostic is received.
		 * 3. Send in a "warning" configuration.
		 * 4. COnfirm that a diagnostic is received.
		 */
		it("ignore to warning configuration", function(finished) {
			this.timeout(5000);
			test218("218-ignore-to-warning", "ignore", "warning", finished);
		});
	
		/**
		 * 1. Start by sending in a configuration to "ignore" the diagnostic.
		 * 2. Confirm that no diagnostic is received.
		 * 3. Send in an "error" configuration.
		 * 4. COnfirm that a diagnostic is received.
		 */
		it("ignore to error configuration", function(finished) {
			this.timeout(5000);
			test218("218-ignore-to-error","ignore", "error", finished);
		});
	})


	it("issue #223", function (finished) {
		this.timeout(5000);
		let document = {
			languageId: "dockerfile",
			version: 1,
			uri: "uri://dockerfile/223.txt",
			text: "FROM node\nMAINTAINER deprecated"
		};
		sendNotification("textDocument/didOpen", {
			textDocument: document
		});

		let id = sendRequest("textDocument/documentSymbol", {
			textDocument: {
				uri: document.uri
			}
		});
		let first = true;
		const listener223 = (json) => {
			if (json.id === id) {
				assert.equal(json.result[0].name, "FROM");
				assert.equal(json.result[0].location.uri, document.uri);
				assert.equal(json.result[0].location.range.start.line, 0);
				assert.equal(json.result[0].location.range.start.character, 0);
				assert.equal(json.result[0].location.range.end.line, 0);
				assert.equal(json.result[0].location.range.end.character, 4);
				assert.equal(json.result[0].kind, SymbolKind.Function);
				assert.strictEqual(json.result[0].deprecated, undefined);

				assert.equal(json.result[1].name, "MAINTAINER");
				assert.equal(json.result[1].location.uri, document.uri);
				assert.equal(json.result[1].location.range.start.line, 1);
				assert.equal(json.result[1].location.range.start.character, 0);
				assert.equal(json.result[1].location.range.end.line, 1);
				assert.equal(json.result[1].location.range.end.character, 10);
				assert.equal(json.result[1].kind, SymbolKind.Function);
				assert.equal(json.result[1].deprecated, true);
				lspProcess.removeListener("message", listener223);
				finished();
			}
		};
		lspProcess.on("message", listener223);
	});

	it("issue #221", function (finished) {
		this.timeout(5000);
		let document = {
			languageId: "dockerfile",
			version: 1,
			uri: "uri://dockerfile/221.txt",
			text: "FROM node"
		};
		sendNotification("textDocument/didOpen", {
			textDocument: document
		});

		let documentLink = sendRequest("textDocument/documentLink", {
			textDocument: {
				uri: document.uri
			}
		});
		let resolve = -1;
		const listener221 = (json) => {
			if (json.id === documentLink) {
				assert.equal(json.result.length, 1);
				assert.strictEqual(json.result[0].target, undefined);
				assert.equal(json.result[0].data, "_/node/");
				assert.equal(json.result[0].range.start.line, 0);
				assert.equal(json.result[0].range.start.character, 5);
				assert.equal(json.result[0].range.end.line, 0);
				assert.equal(json.result[0].range.end.character, 9);

				resolve = sendRequest("documentLink/resolve", json.result[0]);
			} else if (json.id === resolve) {
				assert.equal(json.result.target, "https://hub.docker.com/_/node/");
				assert.equal(json.result.data, "_/node/");
				assert.equal(json.result.range.start.line, 0);
				assert.equal(json.result.range.start.character, 5);
				assert.equal(json.result.range.end.line, 0);
				assert.equal(json.result.range.end.character, 9);
				finished();
			}
		};
		lspProcess.on("message", listener221);
	});

	it("issue #224", function (finished) {
		this.timeout(5000);
		let document = {
			languageId: "dockerfile",
			version: 1,
			uri: "uri://dockerfile/224.txt",
			text: "FROM node\nMAIN"
		};
		sendNotification("textDocument/didOpen", {
			textDocument: document
		});

		let completion = sendRequest("textDocument/completion", {
			textDocument: {
				uri: document.uri
			},
			position: {
				line: 1,
				character: 4
			}
		});
		const listener224 = (json) => {
			if (json.id === completion) {
				lspProcess.removeListener("message", listener224);
				assert.equal(json.result.length, 1);
				assert.equal(json.result[0].data, "MAINTAINER");
				assert.equal(json.result[0].deprecated, true);
				assert.equal(json.result[0].insertTextFormat, InsertTextFormat.Snippet);
				assert.equal(json.result[0].kind, CompletionItemKind.Keyword);
				assert.equal(json.result[0].label, "MAINTAINER name");
				assert.equal(json.result[0].textEdit.newText, "MAINTAINER ${1:name}");
				assert.equal(json.result[0].textEdit.range.start.line, 1);
				assert.equal(json.result[0].textEdit.range.start.character, 0);
				assert.equal(json.result[0].textEdit.range.end.line, 1);
				assert.equal(json.result[0].textEdit.range.end.character, 4);
				finished();
			}
		};
		lspProcess.on("message", listener224);
	});

	it("issue #225 commands", function (finished) {
		this.timeout(5000);
		sendNotification("textDocument/didOpen", {
			textDocument: {
				languageId: "dockerfile",
				version: 1,
				uri: "uri://dockerfile/225-commands.txt",
				text: "from node"
			}
		});

		const codeActionResponseId = sendRequest("textDocument/codeAction", {
			textDocument: {
				uri: "uri://dockerfile/225-commands.txt"
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

		const codeActionListener = function (json) {
			if (json.id === codeActionResponseId) {
				assert.ok(Array.isArray(json.result));
				assert.equal(json.result.length, 1);
				assert.equal(json.result[0].title, "Convert instruction to uppercase");
				assert.equal(json.result[0].command, CommandIds.UPPERCASE);
				assert.equal(json.result[0].arguments.length, 2);
				assert.equal(json.result[0].arguments[0], "uri://dockerfile/225-commands.txt");
				assert.equal(json.result[0].arguments[1].start.line, 0);
				assert.equal(json.result[0].arguments[1].start.character, 0);
				assert.equal(json.result[0].arguments[1].end.line, 0);
				assert.equal(json.result[0].arguments[1].end.character, 4);
				lspProcess.removeListener("message", codeActionListener);
				finished();
			}
		};
		lspProcess.on("message", codeActionListener);
	});

	it("issue #225 code actions without quick fixes", function (finished) {
		this.timeout(5000);
		initialize(true, {
			codeActionLiteralSupport: {
				codeActionKind: {
					valueSet: [
						CodeActionKind.Refactor
					]
				}
			}
		});
		sendNotification("textDocument/didOpen", {
			textDocument: {
				languageId: "dockerfile",
				version: 1,
				uri: "uri://dockerfile/225-codeActions-no-quick-fix.txt",
				text: "from node"
			}
		});

		const codeActionResponseId = sendRequest("textDocument/codeAction", {
			textDocument: {
				uri: "uri://dockerfile/225-codeActions-no-quick-fix.txt"
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

		const codeActionListener = function (json) {
			if (json.id === codeActionResponseId) {
				lspProcess.removeListener("message", codeActionListener);
				assert.ok(Array.isArray(json.result));
				assert.equal(json.result.length, 1);
				assert.equal(json.result[0].title, "Convert instruction to uppercase");
				assert.equal(json.result[0].command, CommandIds.UPPERCASE);
				assert.equal(json.result[0].arguments.length, 2);
				assert.equal(json.result[0].arguments[0], "uri://dockerfile/225-codeActions-no-quick-fix.txt");
				assert.equal(json.result[0].arguments[1].start.line, 0);
				assert.equal(json.result[0].arguments[1].start.character, 0);
				assert.equal(json.result[0].arguments[1].end.line, 0);
				assert.equal(json.result[0].arguments[1].end.character, 4);
				finished();
			}
		};
		lspProcess.on("message", codeActionListener);
	});

	it("issue #225 code actions", function (finished) {
		this.timeout(5000);
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
				uri: "uri://dockerfile/225-codeActions.txt",
				text: "from node"
			}
		});

		const codeActionResponseId = sendRequest("textDocument/codeAction", {
			textDocument: {
				uri: "uri://dockerfile/225-codeActions.txt"
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

		const codeActionListener = function (json) {
			if (json.id === codeActionResponseId) {
				assert.ok(Array.isArray(json.result));
				assert.equal(json.result.length, 1);
				assert.equal(json.result[0].title, "Convert instruction to uppercase");

				assert.equal(json.result[0].edit.documentChanges.length, 1);
				assert.equal(json.result[0].edit.documentChanges[0].textDocument.uri, "uri://dockerfile/225-codeActions.txt");
				assert.equal(json.result[0].edit.documentChanges[0].textDocument.version, 1);

				assert.equal(json.result[0].edit.documentChanges[0].edits.length, 1);
				assert.equal(json.result[0].edit.documentChanges[0].edits[0].newText, "FROM");
				assert.equal(json.result[0].edit.documentChanges[0].edits[0].range.start.line, 0);
				assert.equal(json.result[0].edit.documentChanges[0].edits[0].range.start.character, 0);
				assert.equal(json.result[0].edit.documentChanges[0].edits[0].range.end.line, 0);
				assert.equal(json.result[0].edit.documentChanges[0].edits[0].range.end.character, 4);
				lspProcess.removeListener("message", codeActionListener);
				finished();
			}
		};
		lspProcess.on("message", codeActionListener);
	});

	it("unversioned workspace edits", function (finished) {
		this.timeout(5000);
		initializeCustomCapabilities({
			textDocument: {
				codeAction: {
					codeActionLiteralSupport: {
						codeActionKind: {
							valueSet: [
								CodeActionKind.QuickFix
							]
						}
					}
				}
			},
			workspace: {
				applyEdit: true,
				workspaceEdit: {
					documentChanges: false
				}
			}
		});
		sendNotification("textDocument/didOpen", {
			textDocument: {
				languageId: "dockerfile",
				version: 1,
				uri: "uri://dockerfile/225-codeActions-unversioned.txt",
				text: "from node"
			}
		});

		const codeActionResponseId = sendRequest("textDocument/codeAction", {
			textDocument: {
				uri: "uri://dockerfile/225-codeActions-unversioned.txt"
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

		const codeActionListener = function (json) {
			if (json.id === codeActionResponseId) {
				lspProcess.removeListener("message", codeActionListener);

				assert.ok(Array.isArray(json.result));
				assert.equal(json.result.length, 1);
				assert.equal(json.result[0].title, "Convert instruction to uppercase");
				assert.equal(json.result[0].kind, CodeActionKind.QuickFix);

				const changes = json.result[0].edit.changes["uri://dockerfile/225-codeActions-unversioned.txt"];
				assert.equal(changes.length, 1);
				assert.equal(changes[0].newText, "FROM");
				assert.equal(changes[0].range.start.line, 0);
				assert.equal(changes[0].range.start.character, 0);
				assert.equal(changes[0].range.end.line, 0);
				assert.equal(changes[0].range.end.character, 4);
				finished();
			}
		};
		lspProcess.on("message", codeActionListener);
	});

	it("issue #227", function (finished) {
		this.timeout(5000);

		let first = true;
		const diagnosticsListener = (json) => {
			if (json.method === "textDocument/publishDiagnostics") {
				if (first) {
					assert.equal(json.params.uri, "uri://dockerfile/227.txt");
					assert.equal(json.params.diagnostics.length, 1);
					assert.strictEqual(json.params.diagnostics[0].range.start.line, 0);
					assert.strictEqual(json.params.diagnostics[0].range.start.character, 0);
					assert.strictEqual(json.params.diagnostics[0].range.end.line, 0);
					assert.strictEqual(json.params.diagnostics[0].range.end.character, 0);
					assert.strictEqual(json.params.diagnostics[0].severity, DiagnosticSeverity.Error);
					assert.strictEqual(json.params.diagnostics[0].code, ValidationCode.NO_SOURCE_IMAGE);
					assert.strictEqual(json.params.diagnostics[0].source, "dockerfile-utils");
					first = false;
					sendNotification("textDocument/didChange", {
						textDocument: {
							uri: "uri://dockerfile/227.txt",
							version: 2
						},
						contentChanges: [
							{
								text: "FROM node"
							}
						]
					});
				} else {
					lspProcess.removeListener("message", diagnosticsListener);
					assert.equal(json.params.uri, "uri://dockerfile/227.txt");
					assert.equal(json.params.diagnostics.length, 0);
					finished();
				}
			}
		};
		lspProcess.on("message", diagnosticsListener);

		sendNotification("textDocument/didOpen", {
			textDocument: {
				languageId: "dockerfile",
				version: 1,
				uri: "uri://dockerfile/227.txt",
				text: ""
			}
		});
	});

	it("issue #226", function (finished) {
		this.timeout(5000);

		sendNotification("textDocument/didOpen", {
			textDocument: {
				languageId: "dockerfile",
				version: 1,
				uri: "uri://dockerfile/226.txt",
				text: "# comment\n# comment2\n# comment3\nFROM node"
			}
		});

		const requestId = sendRequest("textDocument/foldingRange", {
			textDocument: {
				uri: "uri://dockerfile/226.txt",
			}
		});

		const foldingRangeListener = (json) => {
			if (json.id === requestId) {
				assert.strictEqual(json.result.length, 1);
				assert.strictEqual(json.result[0].startLine, 0);
				assert.strictEqual(json.result[0].startCharacter, 9);
				assert.strictEqual(json.result[0].endLine, 2);
				assert.strictEqual(json.result[0].endCharacter, 10);
				assert.strictEqual(json.result[0].kind, FoldingRangeKind.Comment);
				finished();
			}
		};
		lspProcess.on("message", foldingRangeListener);
	});

	it("folding range lines only", function (finished) {
		this.timeout(5000);
		initializeCustomCapabilities(
			{
				textDocument: {
					foldingRange: {
						lineFoldingOnly: true
					}
				}
			}
		);
		sendNotification("textDocument/didOpen", {
			textDocument: {
				languageId: "dockerfile",
				version: 1,
				uri: "uri://dockerfile/folding-lines-only.txt",
				text: "# comment\n# comment2\n# comment3\nFROM node"
			}
		});

		const requestId = sendRequest("textDocument/foldingRange", {
			textDocument: {
				uri: "uri://dockerfile/folding-lines-only.txt",
			}
		});

		const foldingRangeListener = (json) => {
			if (json.id === requestId) {
				assert.strictEqual(json.result.length, 1);
				assert.strictEqual(json.result[0].startLine, 0);
				assert.strictEqual(json.result[0].startCharacter, undefined);
				assert.strictEqual(json.result[0].endLine, 2);
				assert.strictEqual(json.result[0].endCharacter, undefined);
				assert.strictEqual(json.result[0].kind, FoldingRangeKind.Comment);
				finished();
			}
		};
		lspProcess.on("message", foldingRangeListener);
	});

	it("folding range string zero", function (finished) {
		this.timeout(5000);
		initializeCustomCapabilities(
			{
				textDocument: {
					foldingRange: {
						rangeLimit: "0"
					}
				}
			}
		);
		sendNotification("textDocument/didOpen", {
			textDocument: {
				languageId: "dockerfile",
				version: 1,
				uri: "uri://dockerfile/folding-string-zero.txt",
				text: "# comment\n# comment2\n# comment3\nFROM node"
			}
		});

		const requestId = sendRequest("textDocument/foldingRange", {
			textDocument: {
				uri: "uri://dockerfile/folding-string-zero.txt",
			}
		});

		const foldingRangeListener = (json) => {
			if (json.id === requestId) {
				lspProcess.removeListener("message", foldingRangeListener);
				assert.strictEqual(json.result.length, 0);
				finished();
			}
		};
		lspProcess.on("message", foldingRangeListener);
	});

	it("folding range string zero", function (finished) {
		this.timeout(5000);
		initializeCustomCapabilities(
			{
				textDocument: {
					foldingRange: {
						rangeLimit: 0
					}
				}
			}
		);
		sendNotification("textDocument/didOpen", {
			textDocument: {
				languageId: "dockerfile",
				version: 1,
				uri: "uri://dockerfile/folding-lines-range-zero.txt",
				text: "# comment\n# comment2\n# comment3\nFROM node"
			}
		});

		const requestId = sendRequest("textDocument/foldingRange", {
			textDocument: {
				uri: "uri://dockerfile/folding-lines-range-zero.txt",
			}
		});

		const foldingRangeListener = (json) => {
			if (json.id === requestId) {
				lspProcess.removeListener("message", foldingRangeListener);
				assert.strictEqual(json.result.length, 0);
				finished();
			}
		};
		lspProcess.on("message", foldingRangeListener);
	});

	function test231(uri: string, content: string, position: Position, range: Range, callback: Function) {
		sendNotification("textDocument/didOpen", {
			textDocument: {
				languageId: "dockerfile",
				version: 1,
				uri,
				text: content
			}
		});

		const requestId = sendRequest("textDocument/prepareRename", {
			textDocument: {
				uri,
			},
			position
		});

		const listener = (json) => {
			if (json.id === requestId) {
				lspProcess.removeListener("message", listener);
				if (range === null) {
					assert.strictEqual(json.result, null);
				} else {
					assert.strictEqual(json.result.start.line, range.start.line);
					assert.strictEqual(json.result.start.character, range.start.character);
					assert.strictEqual(json.result.end.line, range.end.line);
					assert.strictEqual(json.result.end.character, range.end.character);
				}
				callback();
			}
		};
		lspProcess.on("message", listener);
	}

	it("issue #231 build stage", function (finished) {
		this.timeout(5000);
		test231(
			"uri://dockerfile/231-build-stage.txt",
			"FROM node as setup",
			{
				line: 0,
				character: 15
			}, {
				start: {
					line: 0,
					character: 13
				},
				end: {
					line: 0,
					character: 18
				}
			},
			finished
		);
	});

	it("issue #231 variable", function (finished) {
		this.timeout(5000);
		test231(
			"uri://dockerfile/231-variable.txt",
			"FROM node as setup\nARG test",
			{
				line: 1,
				character: 6
			}, {
				start: {
					line: 1,
					character: 4
				},
				end: {
					line: 1,
					character: 8
				}
			},
			finished
		);
	});

	it("issue #231 instruction", function (finished) {
		this.timeout(5000);
		test231(
			"uri://dockerfile/231-instruction.txt",
			"FROM node",
			{
				line: 0,
				character: 7
			},
			null,
			finished
		);
	});

	it("document highlight", function(finished) {
		sendNotification("textDocument/didOpen", {
			textDocument: {
				languageId: "dockerfile",
				version: 1,
				uri: "uri://dockerfile/document-highlight.txt",
				text: "FROM node AS setup"
			}
		});

		const requestId = sendRequest("textDocument/documentHighlight", {
			textDocument: {
				uri: "uri://dockerfile/document-highlight.txt",
			},
			position: {
				line: 0,
				character: 15
			}
		});

		const listener = (json) => {
			if (json.id === requestId) {
				lspProcess.removeListener("message", listener);
				assert.ok(json.result instanceof Array);
				assert.strictEqual(json.result.length, 1);
				assert.strictEqual(json.result[0].kind, DocumentHighlightKind.Write);
				assert.strictEqual(json.result[0].range.start.line, 0);
				assert.strictEqual(json.result[0].range.start.character, 13);
				assert.strictEqual(json.result[0].range.end.line, 0);
				assert.strictEqual(json.result[0].range.end.character, 18);
				finished();
			}
		};
		lspProcess.on("message", listener);
	});

	it("definition", function(finished) {
		sendNotification("textDocument/didOpen", {
			textDocument: {
				languageId: "dockerfile",
				version: 1,
				uri: "uri://dockerfile/definition.txt",
				text: "FROM node AS setup"
			}
		});

		const requestId = sendRequest("textDocument/definition", {
			textDocument: {
				uri: "uri://dockerfile/definition.txt",
			},
			position: {
				line: 0,
				character: 15
			}
		});

		const listener = (json) => {
			if (json.id === requestId) {
				lspProcess.removeListener("message", listener);
				assert.strictEqual(json.result.uri, "uri://dockerfile/definition.txt");
				assert.strictEqual(json.result.range.start.line, 0);
				assert.strictEqual(json.result.range.start.character, 13);
				assert.strictEqual(json.result.range.end.line, 0);
				assert.strictEqual(json.result.range.end.character, 18);
				finished();
			}
		};
		lspProcess.on("message", listener);
	});

	it("formatting", function(finished) {
		sendNotification("textDocument/didOpen", {
			textDocument: {
				languageId: "dockerfile",
				version: 1,
				uri: "uri://dockerfile/formatting.txt",
				text: " FROM node AS setup"
			}
		});

		const requestId = sendRequest("textDocument/formatting", {
			textDocument: {
				uri: "uri://dockerfile/formatting.txt",
			},
			options: {
				insertSpaces: true,
				tabSize: 4
			}
		});

		const listener = (json) => {
			if (json.id === requestId) {
				lspProcess.removeListener("message", listener);
				assert.ok(json.result instanceof Array);
				assert.strictEqual(json.result.length, 1);
				assert.strictEqual(json.result[0].newText, "");
				assert.strictEqual(json.result[0].range.start.line, 0);
				assert.strictEqual(json.result[0].range.start.character, 0);
				assert.strictEqual(json.result[0].range.end.line, 0);
				assert.strictEqual(json.result[0].range.end.character, 1);
				finished();
			}
		};
		lspProcess.on("message", listener);
	});

	it("range formatting", function(finished) {
		sendNotification("textDocument/didOpen", {
			textDocument: {
				languageId: "dockerfile",
				version: 1,
				uri: "uri://dockerfile/range-formatting.txt",
				text: " FROM node AS setup"
			}
		});

		const requestId = sendRequest("textDocument/rangeFormatting", {
			textDocument: {
				uri: "uri://dockerfile/range-formatting.txt",
			},
			range: {
				start: {
					line: 0,
					character: 0
				},
				end: {
					line: 0,
					character: 3
				}
			},
			options: {
				insertSpaces: true,
				tabSize: 4
			}
		});

		const listener = (json) => {
			if (json.id === requestId) {
				lspProcess.removeListener("message", listener);
				assert.ok(json.result instanceof Array);
				assert.strictEqual(json.result.length, 1);
				assert.strictEqual(json.result[0].newText, "");
				assert.strictEqual(json.result[0].range.start.line, 0);
				assert.strictEqual(json.result[0].range.start.character, 0);
				assert.strictEqual(json.result[0].range.end.line, 0);
				assert.strictEqual(json.result[0].range.end.character, 1);
				finished();
			}
		};
		lspProcess.on("message", listener);
	});

	it("on type formatting", function(finished) {
		sendNotification("textDocument/didOpen", {
			textDocument: {
				languageId: "dockerfile",
				version: 1,
				uri: "uri://dockerfile/on-type-formatting.txt",
				text: "FROM node AS setup\nRUN echo \necho"
			}
		});

		const requestId = sendRequest("textDocument/onTypeFormatting", {
			textDocument: {
				uri: "uri://dockerfile/on-type-formatting.txt",
			},
			position: {
				line: 1,
				character: 9
			},
			ch: '\\',
			options: {
				insertSpaces: true,
				tabSize: 4
			}
		});

		const listener = (json) => {
			if (json.id === requestId) {
				lspProcess.removeListener("message", listener);
				assert.ok(json.result instanceof Array);
				assert.strictEqual(json.result.length, 1);
				assert.strictEqual(json.result[0].newText, "    ");
				assert.strictEqual(json.result[0].range.start.line, 2);
				assert.strictEqual(json.result[0].range.start.character, 0);
				assert.strictEqual(json.result[0].range.end.line, 2);
				assert.strictEqual(json.result[0].range.end.character, 0);
				finished();
			}
		};
		lspProcess.on("message", listener);
	});

	it("rename", function(finished) {
		sendNotification("textDocument/didOpen", {
			textDocument: {
				languageId: "dockerfile",
				version: 1,
				uri: "uri://dockerfile/rename.txt",
				text: "FROM node AS setup"
			}
		});

		const requestId = sendRequest("textDocument/rename", {
			textDocument: {
				uri: "uri://dockerfile/rename.txt",
			},
			position: {
				line: 0,
				character: 15
			},
			newName: "build"
		});

		const listener = (json) => {
			if (json.id === requestId) {
				lspProcess.removeListener("message", listener);
				const changes = json.result.changes["uri://dockerfile/rename.txt"];
				assert.ok(changes instanceof Array);
				assert.strictEqual(changes.length, 1);
				assert.strictEqual(changes[0].newText, "build");
				assert.strictEqual(changes[0].range.start.line, 0);
				assert.strictEqual(changes[0].range.start.character, 13);
				assert.strictEqual(changes[0].range.end.line, 0);
				assert.strictEqual(changes[0].range.end.character, 18);
				finished();
			}
		};
		lspProcess.on("message", listener);
	});

	it("issue #232", function(finished) {
		const requestId = sendRequest("textDocument/definition", {
			textDocument: {
				uri: "uri://dockerfile/232.txt",
			},
			position: {
				line: 0,
				character: 1
			}
		});

		const listener = (json) => {
			if (json.id === requestId) {
				lspProcess.removeListener("message", listener);
				assert.strictEqual(json.result, null);
				finished();
			}
		};
		lspProcess.on("message", listener);
	});

	function testInvalidFile(request: string, assertionCallback: Function) {
		it(request, function(finished) {
			this.timeout(5000);
			const requestId = sendRequest(request, {
				textDocument: {
					uri: "file://dockerfile-lsp-test/non-existent-file.txt",
				},
				position: {
					line: 0,
					character: 0
				}
			});
	
			const listener = (json) => {
				if (json.id === requestId) {
					lspProcess.removeListener("message", listener);
					assertionCallback(json.result);
					finished();
				}
			};
			lspProcess.on("message", listener);
		});
	}

	function testInvalidFileNullResponse(request: string) {
		testInvalidFile(request, function(result: any) {
			assert.strictEqual(result, null);
		});
	}

	function testInvalidFileEmptyArrayResponse(request: string) {
		testInvalidFile(request, function(result: any) {
			assert.ok(result instanceof Array);
			assert.strictEqual(result.length, 0);
		});
	}

	describe("test invalid file URI", function() {
		testInvalidFileNullResponse("textDocument/completion");
		testInvalidFileNullResponse("textDocument/definition");
		testInvalidFileEmptyArrayResponse("textDocument/foldingRange");
		testInvalidFileEmptyArrayResponse("textDocument/documentHighlight");
		testInvalidFileEmptyArrayResponse("textDocument/documentLink");
		testInvalidFileEmptyArrayResponse("textDocument/documentSymbol");
		testInvalidFileEmptyArrayResponse("textDocument/formatting");
		testInvalidFileNullResponse("textDocument/hover");
		testInvalidFileEmptyArrayResponse("textDocument/onTypeFormatting");
		testInvalidFileNullResponse("textDocument/prepareRename");
		testInvalidFileEmptyArrayResponse("textDocument/rangeFormatting");
		testInvalidFileNullResponse("textDocument/rename");
		testInvalidFile("textDocument/signatureHelp", function(result: any) {
			assert.ok(result.signatures instanceof Array);
			assert.strictEqual(result.signatures.length, 0);
			assert.strictEqual(result.activeParameter, null);
			assert.strictEqual(result.activeSignature, null);
		});
	});

	after(() => {
		// terminate the forked LSP process after all the tests have been run
		lspProcess.kill();
	});
});
