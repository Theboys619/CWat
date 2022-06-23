import { DimeError, DimeSyntaxError } from "./errors.ts";
import AST, { ASTTypes } from "./ast.ts";
import Token, { TokenTypes, Position } from "./token.ts";
import Lexer, {
  dataTypes,
  operators,
  keywords,
  PRECEDENCE,
  assignments,
  noRightHand
} from "./lexer.ts";
import { Type } from "./type.ts";

export default class Parser {
  currentFile: string;

  ast!: AST;
  tokens: Token[];

  curTok: Token;
  index: number;

  constructor(tokens: Token[], currentFile: string = "Unknown") {
    this.tokens = tokens;
    this.currentFile = currentFile;

    this.curTok = this.tokens[0];
    this.index = 0;
  }
  
  advance(amt: number = 1): Token {
    this.index += amt;
    if (this.index > this.tokens.length - 1) {
      return this.curTok = new Token();
    }

    return this.curTok = this.tokens[this.index];
  }

  peek(amt: number = 1): Token {
    if (this.index + amt > this.tokens.length - 1) return new Token();
    return this.tokens[this.index + amt];
  }

  isIgnore(tok: Token): boolean {
    return tok.equals(TokenTypes.Delimiter, ";") || tok.equals(undefined, "\\n") || tok.equals(TokenTypes.NewLine);
  }

  isEOF(): boolean {
    if (this.curTok.isNull()) return true;

    return this.curTok.equals(TokenTypes.EndOfFile);
  }

  skipIgnore(): void {
    while (this.isIgnore(this.curTok) && !this.curTok.isNull() && !this.isEOF()) {
      this.advance();
    }
  }

  skipLinebreak(): void {
    while (this.curTok.equals(TokenTypes.NewLine) || this.curTok.equals(undefined, "\\n")) {
      this.advance();
    }
  }

  skipOver(tok: Token, kind?: string | undefined | null, val?: string | undefined | null) {
    if (!tok.equals(kind, val)) {
      throw new DimeSyntaxError(
        "Unexpected token %t",
        tok.pos.copy(),
        [tok]
      );
    }

    this.advance();
  }

  pDelimiters(start: string, end: string, separator: string = "", isFunc: boolean = false): AST[] {
    const values: AST[] = [];
    let isFirst: boolean = true;

    this.skipOver(this.curTok, undefined, start);
    this.skipLinebreak();

    while (!this.isEOF()) {
      if (this.curTok.equals(TokenTypes.Delimiter, end)) {
        break;
      } else if (isFirst) {
        isFirst = false;
      } else {
        if (separator == "" || !separator) {
          this.skipIgnore();
          this.skipLinebreak();
        } else {
          this.skipOver(this.curTok, undefined, separator);
          this.skipLinebreak();
        }
      }

      if (this.curTok.equals(TokenTypes.Delimiter, end)) {
        break;
      }

      const val: AST = this.pExpression(isFunc);
      values.push(val);
      this.skipLinebreak();
    }
    
    this.skipLinebreak();
    if (this.isIgnore(this.curTok)) {
      this.skipIgnore();
    }
    this.skipLinebreak();
    this.skipOver(this.curTok, undefined, end);

    return values;
  }

  isCallable(callStmt: AST): boolean {
    return (
      callStmt.kind != ASTTypes.Function
      && callStmt.kind != ASTTypes.If
      && callStmt.kind != ASTTypes.Return
    );
  }

  checkCall(expr: AST): AST {
    if (
      this.peek().equals(TokenTypes.Delimiter, "(")
      && this.isCallable(expr)
      && this.curTok.equals(TokenTypes.Identifier)
    ) {
      return this.pCall(expr);
    }

    return expr;
  }

  pCall(expression: AST): AST {
    const varName: Token = expression.value;
    this.advance();

    const funcCall: AST = new AST(ASTTypes.FunctionCall, varName);
    funcCall.args = this.pDelimiters("(", ")", ",");

    // pDotOp(funcCall);

    // funcCall.isCall = true;

    return funcCall;
  }

  pBinary(left: AST, prec: number): AST {
    const op: Token = this.curTok;

    if (op.equals(TokenTypes.Operator)) {
      let opval: string = op.value;
      const newPrec: number = PRECEDENCE[opval];

      if (newPrec > prec) {
        this.advance();

        const kind: string = assignments.includes(opval)
          ? ASTTypes.Assign
          : ASTTypes.Binary;
        
        const expr = new AST(kind, op);
        expr.left = left;
        expr.dataType = expr.left.dataType;

        if (left.kind == ASTTypes.Null) {
          if (noRightHand.includes(opval)) {
            expr.left = this.pBinary(this.pAll(), 0);
            expr.isOpBefore = true;
          }
        }

        expr.op = op;
        if (noRightHand.includes(opval)) {
          expr.right = new AST();
        } else {
          expr.right = this.pBinary(this.pAll(), newPrec);
          if (!expr.dataType) {
            expr.dataType = expr.right.dataType;
          }
        }

        return this.pBinary(expr, prec);
      }
    }

    return left;
  }

  pCheckSubType(dataType: Type): Type {
    // let obj[5] x = {};
    // let obj[obj[2]] y = {};
    
    if (this.curTok.equals(TokenTypes.Delimiter, "[")) {
      this.advance();
      
      if (this.curTok.equals(TokenTypes.Integer)) {
        dataType.addSubType(new Type(this.curTok), true);
        this.advance();
      } else if (!this.curTok.equals(TokenTypes.Delimiter, "]")) {
        const subType: Type = this.pDataType();
        dataType.addSubType(subType, true);

        while (this.curTok.equals(TokenTypes.Delimiter, ",")) {
          this.advance();
          
          const subType: Type = this.pDataType();
          dataType.addSubType(subType, true);
        }
      }
      
      if (this.curTok.equals(TokenTypes.Delimiter, "]")) {
        this.advance();
      }

      if (this.curTok.equals(TokenTypes.Delimiter, "[")) {
        dataType = this.pCheckSubType(dataType);
      }
    }

    if (this.curTok.equals(TokenTypes.Operator, "<")) {
      this.advance();
      
      if (this.curTok.equals(TokenTypes.Integer)) {
        dataType.addSubType(new Type(this.curTok));
        this.advance();
      } else if (!this.curTok.equals(TokenTypes.Operator, ">")) {
        const subType: Type = this.pDataType();
        dataType.addSubType(subType);

        while (this.curTok.equals(TokenTypes.Delimiter, ",")) {
          this.advance();

          const subType: Type = this.pDataType();
          dataType.addSubType(subType);
        }
      }
      
      if (this.curTok.equals(TokenTypes.Operator, ">")) {
        this.advance();
      }
    }

    return dataType;
  }

  pDataType(): Type {
    let dataType = new Type(this.curTok);
    this.advance();
    dataType = this.pCheckSubType(dataType);


    return dataType;

    // TODO:
    // Add namespaced datatype checking
  }

  pVariable(constant: boolean): AST {
    this.advance(); // skip over 'let' or 'const'
    
    const dataType: Type = this.pDataType();

    const identifierTok = this.curTok;
    const varStmt = new AST(ASTTypes.Variable, identifierTok);

    this.advance();

    varStmt.isConst = constant;
    varStmt.dataType = dataType;

    return varStmt;
  }

  pFunction(isExported: boolean = false): AST {
    this.advance(); // skip over 'func' keyword


    const dataType = this.pDataType();

    const identifierTok = this.curTok;
    this.advance(); // skip over 'identifier'

    const funcStmt = new AST(ASTTypes.Function, identifierTok);
    funcStmt.args = this.pDelimiters("(", ")", ",", true);
    funcStmt.block = this.pDelimiters("{", "}");
    funcStmt.dataType = dataType;
    funcStmt.isExported = isExported;

    return funcStmt;
  }

  pReturn(): AST {
    const retToken = this.curTok;
    this.advance(); // skip over 'return'

    const retStmt = new AST(ASTTypes.Return, retToken);
    
    if (!this.curTok.equals(TokenTypes.Delimiter, ';') && !this.curTok.equals(TokenTypes.NewLine)) {
      retStmt.assign = this.pExpression();
      retStmt.dataType = retStmt.assign.dataType;
    }

    return retStmt;
  }

  pAccess(exp: AST): AST {
    if (!this.curTok.equals(null, ".") && !this.curTok.equals(null, "[")) {
      return exp;
    }

    let isSubscript: boolean = this.curTok.equals(null, "[");
    this.advance();

    if (
      this.curTok.equals(TokenTypes.Identifier)
      || (
        isSubscript && (
          this.curTok.equals(TokenTypes.String)
          || this.curTok.equals(TokenTypes.Integer)
        )
      )
    ) {
      let access: AST = this.pExpression();
      if (isSubscript) {
        access.isSubscript = true;
        this.skipOver(this.curTok, null, "]");

        if (assignments.includes(this.curTok.value)) {
          access = this.pBinary(access, 0);
        }

        this.pAccess(access);

        if (
          access.kind == ASTTypes.String
          || access.kind == ASTTypes.Integer
        ) {
          access.parent = exp;
          exp.access = access;
          return exp;
        }
      }

      if (
        access.kind != ASTTypes.FunctionCall
        && access.kind != ASTTypes.Identifier
        && access.kind != ASTTypes.Assign
      ) {
        new DimeSyntaxError(
          "Unable to access with that is not identifier or call!",
          this.curTok.pos.copy(),
          []
        ); // Todo: Fix 'error'
      }

      access.parent = exp;
      exp.access = access;
    }

    return exp;
  }

  pIdentifier(exp: AST, isFunc: boolean = false): AST {
    exp.kind = ASTTypes.Identifier;

    if (isFunc && !this.peek().equals(TokenTypes.Delimiter, ":")) {
      new DimeError(`Paramater has no type specified. Please specify a type!`, this.curTok.pos, []);
    } else if (isFunc && this.peek().equals(TokenTypes.Delimiter, ":")) {
      this.advance(2);
      const dataType = this.pDataType();
      exp.dataType = dataType;
      exp.kind = ASTTypes.Variable;

      return exp;
    }

    if (!this.peek().equals(TokenTypes.Delimiter, '('))
      this.advance();

    // TODO: Parse 'dot' operation
    this.pAccess(exp);

    return exp;
  }

  pIf(): AST {
    const ifToken = this.curTok;
    this.advance(); // skip over 'if'

    const ifStmt = new AST(ASTTypes.If, ifToken);
    ifStmt.condition = this.pExpression();
    
    if (this.curTok.equals(TokenTypes.Delimiter, "{")) {
      ifStmt.block = this.pDelimiters("{", "}");
    } else {
      ifStmt.block = [this.pExpression()];
    }

    if (this.curTok.equals(TokenTypes.Keyword, "else")) {
      ifStmt.els = new AST(ASTTypes.Else, this.curTok);
      this.advance(); // skip over 'else'

      if (this.curTok.equals(TokenTypes.Delimiter, "{")) {
        ifStmt.els.block = this.pDelimiters("{", "}");
      } else {
        ifStmt.els.block = [this.pExpression()];
      }
    }

    return ifStmt;
  }

  pWhile(): AST {
    const whileTok = this.curTok;
    this.advance(); // skip over 'while'

    const whileStmt = new AST(ASTTypes.WhileLoop, whileTok);
    whileStmt.condition = this.pExpression();
    if (this.curTok.equals(TokenTypes.Delimiter, "{")) {
      whileStmt.block = this.pDelimiters("{", "}");
    } else {
      whileStmt.block = [this.pExpression()];
    }

    return whileStmt;
  }

  pFor(): AST {
    const forTok = this.curTok;
    this.advance(); // skip over 'for'

    const forStmt = new AST(ASTTypes.ForLoop, forTok);

    this.skipOver(this.curTok, TokenTypes.Delimiter, "(");

    // assignment
    if (!this.curTok.equals(TokenTypes.Delimiter, ";")) {
      forStmt.assign = this.pExpression();
      if (this.curTok.equals(TokenTypes.Delimiter, ";"))
        this.advance();
    } else {
      this.advance();
    }

    // condition
    if (!this.curTok.equals(TokenTypes.Delimiter, ";")) {
      forStmt.condition = this.pExpression();
      if (this.curTok.equals(TokenTypes.Delimiter, ";"))
        this.advance();
    } else {
      forStmt.condition = new AST(ASTTypes.Boolean, new Token(TokenTypes.Boolean, "true", forTok.pos.copy()));
      this.advance();
    }

    // increment
    if (!this.curTok.equals(TokenTypes.Delimiter, ";")) {
      forStmt.right = this.pExpression();
      if (this.curTok.equals(TokenTypes.Delimiter, ";"))
        this.advance();
    } else {
      this.advance();
    }
    this.skipOver(this.curTok, TokenTypes.Delimiter, ")");

    forStmt.condition = this.pExpression();
    if (this.curTok.equals(TokenTypes.Delimiter, "{")) {
      forStmt.block = this.pDelimiters("{", "}");
    } else {
      forStmt.block = [this.pExpression()];
    }

    return forStmt;
  }

  pExtern(): AST {
    const externTok = this.curTok;
    this.advance(); // skip over 'extern'

    let externStmt = new AST(ASTTypes.Extern, externTok);

    if (this.curTok.equals(TokenTypes.Keyword, "func")) {
      this.advance(); // skip over 'func'

      const dataType = this.pDataType();

      const identifierTok = this.curTok;
      this.advance(); // skip over 'identifier'

      const funcStmt = new AST(ASTTypes.FunctionDef, identifierTok);
      funcStmt.args = this.pDelimiters("(", ")", ",", true);
      funcStmt.dataType = dataType;

      externStmt.assign = funcStmt;
    } else if (this.curTok.equals(TokenTypes.Keyword, "let")) {

    }

    return externStmt;
  }

  pInclude(): AST {
    const includeTok = this.curTok;
    this.advance(); // skip over 'include'

    const includeStmt = new AST(ASTTypes.Include, includeTok);
    includeStmt.assign = this.pExpression();

    return includeStmt;
  }

  pDefine(): AST {
    const defineTok = this.curTok;
    this.advance();

    const stmt = new AST(ASTTypes.Define, defineTok);
    stmt.left = this.pExpression();
    stmt.right = this.pExpression();

    return stmt;
  }

  // pDefineSize(): AST {
  //   const dataType = this.curTok;

  //   if (this.peek(3).equals(TokenTypes.Identifier)) {
  //     return this.pVariable(false, dataType);
  //   }

  //   this.advance(); // dataType
  //   this.advance(); // "["
  //   const elementsTok = this.curTok; // 4
  //   this.advance();
  //   this.advance(); // "]"

  //   const stmt = new AST(ASTTypes.StackAlloc, elementsTok);
  //   stmt.dataType = dataType;

  //   return stmt;
  // }

  $pAll(isFunc: boolean = false): AST {
    if (this.curTok.equals(TokenTypes.Delimiter, '(')) {
      this.skipOver(this.curTok, TokenTypes.Delimiter, '(');
      const expr = this.pExpression();
      this.skipOver(this.curTok, TokenTypes.Delimiter, ')');

      return expr;
    }

    const oldTok = new AST(ASTTypes.Null, this.curTok);

    if (
      this.curTok.equals(TokenTypes.Keyword, "let")
    ) {
      return this.pVariable(false);
    }

    if (
      this.curTok.equals(TokenTypes.Keyword, "const")
    ) {
      return this.pVariable(true);
    }

    // if (
    //   this.curTok.equals(TokenTypes.DataType) &&
    //   this.peek.equals(TokenTypes.Delimiter, "[")
    // ) {
    //   return this.pDefineSize();
    // }

    if (
      this.curTok.equals(TokenTypes.Keyword, "export")
      && this.peek().equals(TokenTypes.Keyword, "func")
    ) {
      this.advance();
      return this.pFunction(true); // first bool is = isExported
    }

    if (this.curTok.equals(TokenTypes.Keyword, "func"))
      return this.pFunction();

    if (this.curTok.equals(TokenTypes.Keyword, "return"))
      return this.pReturn();

    if (this.curTok.equals(TokenTypes.Keyword, "if"))
      return this.pIf();

    if (this.curTok.equals(TokenTypes.Keyword, "while"))
      return this.pWhile();

    if (this.curTok.equals(TokenTypes.Keyword, "For"))
      return this.pFor();

    if (this.curTok.equals(TokenTypes.Keyword, "extern"))
      return this.pExtern();

    if (this.curTok.equals(TokenTypes.Keyword, "include"))
      return this.pInclude();

    if (
      this.curTok.equals(TokenTypes.Keyword, "true") ||
      this.curTok.equals(TokenTypes.Keyword, "false")
    ) {
      oldTok.kind = ASTTypes.Boolean;
      oldTok.dataType = new Type(new Token(TokenTypes.Datatype, "i32", oldTok.value.pos));
      this.advance();

      return oldTok;
    } else if (this.curTok.equals(TokenTypes.String)) {
      oldTok.kind = ASTTypes.String;
      oldTok.dataType = new Type(new Token(TokenTypes.Datatype, "str", oldTok.value.pos));

      this.advance();

      return oldTok;
    } else if (this.curTok.equals(TokenTypes.Char)) {
      oldTok.kind = ASTTypes.Char;
      oldTok.dataType = new Type(new Token(TokenTypes.Datatype, "char", oldTok.value.pos));

      return oldTok;
    } else if (this.curTok.equals(TokenTypes.Integer)) {
      oldTok.kind = ASTTypes.Integer;
      oldTok.dataType = new Type(new Token(TokenTypes.Datatype, "i32", oldTok.value.pos));

      this.advance();

      return oldTok;
    } else if (this.curTok.equals(TokenTypes.Double)) {
      oldTok.kind = ASTTypes.Double;
      oldTok.dataType = new Type(new Token(TokenTypes.Datatype, "f64", oldTok.value.pos));

      this.advance();

      return oldTok;
    }

    if (this.curTok.equals(TokenTypes.Identifier)) {
      return this.pIdentifier(oldTok, isFunc);
    }

    new DimeSyntaxError(
      `Unknown token '%s'`,
      this.curTok.pos,
      [this.curTok.value]
    );

    return oldTok;
  }

  pAll(isFunc: boolean = false): AST {
    return this.checkCall(this.$pAll(isFunc));
  }

  pExpression(isFunc: boolean = false): AST {
    return this.checkCall(this.pBinary(this.pAll(isFunc), 0));
  }

  parse(): AST {
    this.ast = new AST(ASTTypes.Scope, new Token(TokenTypes.Identifier, "_GLOBAL_"));
    this.curTok = this.tokens[0];

    this.ast.block = [];
    this.ast.args = [];

    while (!this.curTok.isNull() && !this.isEOF()) {
      const exp = this.pExpression();
      this.ast.block.push(exp);

      this.skipLinebreak();
      if (this.isIgnore(this.curTok)) {
        this.skipIgnore();
      }
      this.skipLinebreak();
    }
    
    return this.ast;
  }
};