// The inline calculator for amount fields [FR-LED-3, FR-UI-31]: + − × ÷, parentheses, decimals and unary minus,
// with "$" and thousands separators tolerated in numbers ("$1,234.56 - 20"). From Checquery's
// evaluateCalculatorExpression.

type Token =
  | { type: 'num'; val: number }
  | { type: 'op'; val: '+' | '-' | '*' | '/' }
  | { type: 'lparen' }
  | { type: 'rparen' }

const tokenRegex = /(\$?\d[\d,]*(?:\.\d+)?|\$?\.\d+|[+\-*/()])/g

function tokenize(expr: string): Token[] {
  const normalized = expr.replace(/[−–]/g, '-').replace(/×/g, '*').replace(/÷/g, '/')
  const tokens: Token[] = []
  let last = 0
  tokenRegex.lastIndex = 0
  for (let m = tokenRegex.exec(normalized); m !== null; m = tokenRegex.exec(normalized)) {
    if (normalized.slice(last, m.index).trim())
      throw new Error(`Unexpected “${normalized.slice(last, m.index).trim()}”`)
    last = tokenRegex.lastIndex
    const s = m[1]!
    if (s === '(') tokens.push({ type: 'lparen' })
    else if (s === ')') tokens.push({ type: 'rparen' })
    else if (s === '+' || s === '-' || s === '*' || s === '/') tokens.push({ type: 'op', val: s })
    else tokens.push({ type: 'num', val: Number.parseFloat(s.replace(/^\$/, '').replace(/,/g, '')) })
  }
  if (normalized.slice(last).trim()) throw new Error(`Unexpected “${normalized.slice(last).trim()}”`)
  return tokens
}

function parse(tokens: Token[]): number {
  let pos = 0
  const peek = () => tokens[pos]
  const next = () => {
    const t = tokens[pos++]
    if (!t) throw new Error('The expression is incomplete.')
    return t
  }
  const addSub = (): number => {
    let left = mulDiv()
    for (let t = peek(); t?.type === 'op' && (t.val === '+' || t.val === '-'); t = peek()) {
      next()
      left = t.val === '+' ? left + mulDiv() : left - mulDiv()
    }
    return left
  }
  const mulDiv = (): number => {
    let left = unary()
    for (let t = peek(); t?.type === 'op' && (t.val === '*' || t.val === '/'); t = peek()) {
      next()
      const right = unary()
      if (t.val === '/' && right === 0) throw new Error('Division by zero.')
      left = t.val === '*' ? left * right : left / right
    }
    return left
  }
  const unary = (): number => {
    const t = peek()
    if (t?.type === 'op' && (t.val === '-' || t.val === '+')) {
      next()
      return t.val === '-' ? -unary() : unary()
    }
    return primary()
  }
  const primary = (): number => {
    const t = next()
    if (t.type === 'num') return t.val
    if (t.type === 'lparen') {
      const v = addSub()
      if (peek()?.type !== 'rparen') throw new Error('A parenthesis is not closed.')
      next()
      return v
    }
    throw new Error('The expression is incomplete.')
  }
  const value = addSub()
  if (pos < tokens.length) throw new Error('Unexpected text after the expression.')
  return value
}

/** Evaluates an expression to a number; throws with a plain message if it isn't one. */
export function evaluate(expr: string): number {
  const tokens = tokenize(expr)
  if (tokens.length === 0) throw new Error('Enter an amount.')
  return parse(tokens)
}

/** An amount field's text to cents (rounded to the cent), or an error message. Empty text is zero. */
export function amountToCents(text: string): { cents: number } | { error: string } {
  if (!text.trim()) return { cents: 0 }
  try {
    const value = evaluate(text)
    if (!Number.isFinite(value)) return { error: 'That is not an amount.' }
    return { cents: Math.round(value * 100) }
  } catch (err) {
    return { error: (err as Error).message }
  }
}

/** The amount a search could mean, in cents, or null when the text isn't a number ("45.50", "$1,200"). */
export function searchAmount(text: string): number | null {
  if (!/\d/.test(text) || !/^[\s$\d.,]+$/.test(text)) return null
  const result = amountToCents(text)
  return 'cents' in result && result.cents > 0 ? result.cents : null
}
