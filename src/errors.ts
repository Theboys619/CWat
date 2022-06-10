import { assert } from "https://deno.land/std@0.111.0/testing/asserts.ts";
import Token, { Position } from "./token.ts";

export class DimeError {
  msg: string;
  position: Position;
  
  constructor(msg: string, position: Position | null, params: any[]) {
    if (!position) position = new Position("REPL", 0, 0);
    const errorType = this.constructor.name.replace("Dime", "");

    this.position = position;

    let currparam = 0;
    this.msg = errorType + ": " + msg.replace(/(\%t|\%v|\%s)/g, (match: string, g1, g2): string => {
      if (match === "%t") {
        const param = params[currparam++];

        assert((param instanceof Token), "Variable 'param' must be of type 'Token'.");

        return '\'' + param.kind.toString() + '\'';
      }

      if (match === "%v") {
        const param = params[currparam++];

        assert((param instanceof Token), "Variable 'param' must be of type 'Token'.");

        return '\'' + param.value + '\'';
      }

      if (match === "%s") {
        const param = params[currparam++];

        assert(
          typeof param === "string" || typeof param === "number",
          "Variable 'param' must be of type 'number' or 'string'"
        );

        return param.toString();
      }

      return match;
    });

    this.msg += `\n\tat ${position.file ?? "REPL"}:${position.line+1}:${position.column}`;

    this.exit();
  }

  exit() {
    if (this.position.file && !["REPL","unknown", "UNKNOWN", "BUILTIN"].includes(this.position.file)) {
      const column = this.position.column;
      const line = this.position.line;
      const text = new TextDecoder("utf-8").decode(Deno.readFileSync(this.position.file));
      const lines = text.split("\n");
      const selected = lines.slice(line > 0 ? line - 1 : line, line + 2 <= lines.length ? line + 2 : line + 1);
      const data = selected;

      const escapeBegin = `\x1B[48;2;240;43;104m`; //\x1B[58;2;240;143;104m
      const escapeEnd = `\x1B[0m`; //\x1B[59m

      let stringData = lines[line];
        
      if (data.length > 1 && line !== 0) {
        console.log((line) + " | " + data[0]);
      }

      const dataLength = this.position.length ?? 0;

      let printData = (line + 1) + " | " + stringData.substring(0, column) + escapeBegin + stringData.substring(column, column + dataLength);
      printData += escapeEnd;
      printData += stringData.substring(column + dataLength);

      console.log(printData);

      if (data.length > 2) {
        console.log((line + 2) + " | " + data[2]);
      } else if (data.length > 1 && line == 0) {
        console.log("2 | " + data[1]);
      }
    }
    console.log(this.msg);
    Deno.exit(1);
  }
}

export class DimeSyntaxError extends DimeError {
  constructor(msg: string, position: Position | null, params: any[]) {
    super(msg, position, params);
  }
}