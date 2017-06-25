/* --------------------------------------------------------------------------------------------
 * Copyright (c) Remy Suen. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as child_process from "child_process";
import * as assert from "assert";

import {
	TextEdit, TextDocument, Position, Range,
	Command, ExecuteCommandParams,
	Diagnostic, DiagnosticSeverity
} from 'vscode-languageserver';
import { ValidationCode } from '../src/dockerValidator';
import { DockerCommands, CommandIds } from '../src/dockerCommands';

let uri = "uri://host/Dockerfile.sample";
let dockerCommands = new DockerCommands();

function createDocument(content: string): any {
	return TextDocument.create("uri://host/Dockerfile.sample", "dockerfile", 1, content);
}

function createExtraArgument(): Diagnostic {
	return Diagnostic.create(Range.create(Position.create(0, 0), Position.create(0, 0)), "", DiagnosticSeverity.Warning, ValidationCode.EXTRA_ARGUMENT);
}

function createInvalidEscapeDirective(): Diagnostic {
	return Diagnostic.create(Range.create(Position.create(0, 0), Position.create(0, 0)), "", DiagnosticSeverity.Warning, ValidationCode.INVALID_ESCAPE_DIRECTIVE);
}

function createLowercase(): Diagnostic {
	return Diagnostic.create(Range.create(Position.create(0, 0), Position.create(0, 0)), "", DiagnosticSeverity.Warning, ValidationCode.LOWERCASE);
}

describe("Dockerfile code actions", function () {
	it("no diagnostics", function () {
		let range = Range.create(Position.create(0, 0), Position.create(0, 4));
		let commands = dockerCommands.analyzeDiagnostics([], uri, range);
		assert.equal(commands.length, 0);
	});

	it("extra argument", function () {
		let range = Range.create(Position.create(0, 0), Position.create(0, 4));
		let diagnostic = createExtraArgument();
		let commands = dockerCommands.analyzeDiagnostics([ diagnostic ], uri, range);
		assert.equal(commands.length, 1);
		assert.equal(commands[0].command, CommandIds.EXTRA_ARGUMENT);
		assert.equal(commands[0].arguments.length, 2);
		assert.equal(commands[0].arguments[0], uri);
		assert.equal(commands[0].arguments[1], range);
	});

	it("invalid escape directive", function () {
		let range = Range.create(Position.create(0, 0), Position.create(0, 4));
		let diagnostic = createInvalidEscapeDirective();
		let commands = dockerCommands.analyzeDiagnostics([ diagnostic ], uri, range);
		assert.equal(commands.length, 2);
		assert.equal(commands[0].command, CommandIds.DIRECTIVE_TO_BACKSLASH);
		assert.equal(commands[0].arguments.length, 2);
		assert.equal(commands[0].arguments[0], uri);
		assert.equal(commands[0].arguments[1], range);
		assert.equal(commands[1].command, CommandIds.DIRECTIVE_TO_BACKTICK);
		assert.equal(commands[1].arguments.length, 2);
		assert.equal(commands[1].arguments[0], uri);
		assert.equal(commands[1].arguments[1], range);
	});

	it("convert to uppercase", function () {
		let range = Range.create(Position.create(0, 0), Position.create(0, 4));
		let diagnostic = createLowercase();
		let commands = dockerCommands.analyzeDiagnostics([ diagnostic ], uri, range);
		assert.equal(commands.length, 1);
		assert.equal(commands[0].command, CommandIds.UPPERCASE);
		assert.equal(commands[0].arguments.length, 2);
		assert.equal(commands[0].arguments[0], uri);
		assert.equal(commands[0].arguments[1], range);
	});
});

describe("Dockerfile execute commands", function () {
	it("unknown command", function () {
		let command = Command.create("title", "unknown");
		let document = createDocument("FROM node");
		let edit = dockerCommands.createWorkspaceEdit(document, { command: "unknown", arguments: [] });
		assert.equal(edit, null);
	});

	function directiveTo(commandId: string, suggestion: string) {
		let range = Range.create(Position.create(0, 8), Position.create(0, 9));
		let command = Command.create("", commandId, uri, range);
		let document = createDocument("#escape=a");
		let edit = dockerCommands.createWorkspaceEdit(document, {
			command: commandId,
			arguments: [ uri, range ]
		});
		assert.equal(edit.documentChanges, undefined);
		let edits = edit.changes[uri];
		assert.equal(edits.length, 1);
		assert.equal(edits[0].newText, suggestion);
		assert.equal(edits[0].range, range);
	}

	it("directive to backslash", function () {
		directiveTo(CommandIds.DIRECTIVE_TO_BACKSLASH, '\\');
	});

	it("directive to backtick", function () {
		directiveTo(CommandIds.DIRECTIVE_TO_BACKTICK, '`');
	});

	it("extra argument", function () {
		let range = Range.create(Position.create(0, 10), Position.create(0, 14));
		let command = Command.create("", CommandIds.EXTRA_ARGUMENT, uri, range);
		let document = createDocument("FROM node node");
		let edit = dockerCommands.createWorkspaceEdit(document, {
			command: CommandIds.EXTRA_ARGUMENT,
			arguments: [ uri, range ]
		});
		assert.equal(edit.documentChanges, undefined);
		let edits = edit.changes[uri];
		assert.equal(edits.length, 1);
		assert.equal(edits[0].newText, "");
		assert.equal(edits[0].range, range);
	});

	it("convert to uppercase", function () {
		let range = Range.create(Position.create(0, 0), Position.create(0, 4));
		let command = Command.create("", CommandIds.UPPERCASE, uri, range);
		let document = createDocument("from node");
		let edit = dockerCommands.createWorkspaceEdit(document, {
			command: CommandIds.UPPERCASE,
			arguments: [ uri, range ]
		});
		assert.equal(edit.documentChanges, undefined);
		let edits = edit.changes[uri];
		assert.equal(edits.length, 1);
		assert.equal(edits[0].newText, "FROM");
		assert.equal(edits[0].range, range);
	});
});