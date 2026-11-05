// Reference engine [NFR-TEST-7]: a deliberately simple, slow, independent implementation of the deterministic
// model in requirements §3-§6. It shares only the rule tables with the production engine. Everything else
// (dates, SS, tax, withdrawals, cash flow) is re-derived from the specification with plain loops, no caching,
// and plain bisection for the withdrawal solve.
import { federalRules, medicareRules, rmdRules, scRules, ssaRules } from '@/engine/rules/tables.ts'
import type { HouseholdFile } from '@/schema/model.ts'

type St = 'mfj' | 'single'

export type RefRow = {
  year: number
  ss: [number, number]
  totalTax: number
  drawn: number
  required: number
  liquid: number
  shortfall: number
}

// ---------- dates (month index = year*12 + month-1) ----------
const mi = (s: string) => {
  const [y, m] = s.split('-').map(Number)
  return y! * 12 + m! - 1
}
const parts = (s: string) => s.split('-').map(Number) as [number, number, number]

function ssaInfo(birth: string) {
  let [y, m, d] = parts(birth)
  d -= 1
  if (d === 0) {
    m -= 1
    if (m === 0) {
      m = 12
      y -= 1
    }
    d = new Date(Date.UTC(y, m, 0)).getUTCDate()
  }
  const attain0 = y * 12 + m - 1
  const fraTable: [number, number][] = [
    [1943, 792],
    [1955, 794],
    [1956, 796],
    [1957, 798],
    [1958, 800],
    [1959, 802],
    [1960, 804],
  ]
  let fra = 792
  for (const [yy, mm] of fraTable) if (y >= yy) fra = mm
  const survTable: [number, number][] = [
    [1945, 792],
    [1957, 794],
    [1958, 796],
    [1959, 798],
    [1960, 800],
    [1961, 802],
    [1962, 804],
  ]
  let sfra = 792
  for (const [yy, mm] of survTable) if (y >= yy) sfra = mm
  return {
    attain0,
    fraM: attain0 + fra,
    sfraM: attain0 + sfra,
    sfra,
    m70: attain0 + 840,
    med: attain0 + 780,
    by: parts(birth)[0],
  }
}

// ---------- SS ----------
const dime = (x: number) => Math.floor(x * 10 + 1e-7) / 10

function factorFor(claim: number, fraM: number, m70: number, withheld: number) {
  const early = fraM - claim
  if (early > 0) {
    const n = Math.max(0, early - withheld)
    return 1 - (Math.min(36, n) * 5) / 900 - (Math.max(0, n - 36) * 5) / 1200
  }
  return 1 + ((Math.min(claim, m70) - fraM) * 2) / 300
}

function awiOf(y: number, growth: number) {
  const last = ssaRules.latestAwiYear
  return ssaRules.awi(y) ?? ssaRules.awi(last)! * (1 + growth) ** (y - last)
}

function maxOf(y: number, growth: number) {
  if (ssaRules.taxableMax(y) !== undefined) return ssaRules.taxableMax(y)!
  let v = ssaRules.taxableMax(ssaRules.latestTaxableMaxYear)!
  for (let t = ssaRules.latestTaxableMaxYear + 1; t <= y; t++)
    v = Math.max(v, Math.round((60600 * awiOf(t - 2, growth)) / awiOf(1992, growth) / 300) * 300)
  return v
}

function basePiaRef(birth: string, earnings: Map<number, number>, through: number, growth: number) {
  const elig = Math.floor((ssaInfo(birth).attain0 + 744) / 12)
  const idx = elig - 2
  const vals: number[] = []
  for (const [y, a] of earnings) {
    if (y > through || y < 1951) continue
    const c = Math.min(a, maxOf(y, growth))
    vals.push(y < idx ? (c * awiOf(idx, growth)) / awiOf(y, growth) : c)
  }
  vals.sort((a, b) => b - a)
  const aime = Math.floor(vals.slice(0, 35).reduce((s, v) => s + v, 0) / 420)
  const r = awiOf(elig - 2, growth) / awiOf(1977, growth)
  const b1 = Math.round(180 * r)
  const b2 = Math.round(1085 * r)
  return {
    pia: dime(0.9 * Math.min(aime, b1) + 0.32 * Math.max(0, Math.min(aime, b2) - b1) + 0.15 * Math.max(0, aime - b2)),
    elig,
  }
}

// ---------- tax ----------
function brackets(t: number, b: [number, number][]) {
  let tax = 0
  for (let i = 0; i < b.length; i++) {
    const lo = b[i]![0]
    const hi = b[i + 1]?.[0] ?? Number.POSITIVE_INFINITY
    if (t > lo) tax += (Math.min(t, hi) - lo) * b[i]![1]
  }
  return tax
}

type TaxIn = {
  y: number
  st: St
  f: number
  scF: number
  n65: number
  is65: [boolean, boolean]
  tmax: number
  wages: [number, number]
  se: [number, number]
  ordinary: number
  retireBy: [number, number]
  interest: number
  divs: number
  ltcg: number
  ss: number
  /** Itemizable medical costs (out of pocket) and charitable gifts [FR-TAX-6]. */
  medical: number
  charity: number
}

/** OBBBA SALT cap written from the statute: $40,000 and $500,000 in 2025, each 101% of the prior year to 2029. */
function saltCapRef(y: number, magi: number): number {
  if (y < 2025 || y > 2029) return 10000
  const cap = Math.round(40000 * 1.01 ** (y - 2025))
  const threshold = Math.round(500000 * 1.01 ** (y - 2025))
  return Math.max(10000, cap - 0.3 * Math.max(0, magi - threshold))
}

function taxRef(t: TaxIn) {
  const fp = federalRules.params(t.y, t.f).value
  // payroll
  let pay = 0
  let halfSe = 0
  let medWages = 0
  for (const k of [0, 1] as const) {
    const w = t.wages[k]
    const se = t.se[k] * 0.9235
    pay += Math.min(w, t.tmax) * 0.062 + w * 0.0145
    const seTax = Math.max(0, Math.min(se, t.tmax - w)) * 0.124 + se * 0.029
    pay += seTax
    halfSe += seTax / 2
    medWages += w + se
  }
  pay += 0.009 * Math.max(0, medWages - (t.st === 'mfj' ? 250000 : 200000))
  const pref = t.divs + t.ltcg
  const other = t.wages[0] + t.wages[1] + t.se[0] + t.se[1] - halfSe + t.ordinary + t.interest + pref
  const [b1, b2] = t.st === 'mfj' ? [32000, 44000] : [25000, 34000]
  const pi = other + t.ss / 2
  let tss = 0
  if (t.ss > 0 && pi > b1)
    tss =
      pi <= b2
        ? Math.min(t.ss / 2, (pi - b1) / 2)
        : Math.min(0.85 * t.ss, 0.85 * (pi - b2) + Math.min(t.ss / 2, (b2 - b1) / 2))
  const agi = other + tss
  let senior = 0
  if (t.y >= 2025 && t.y <= 2028)
    senior = t.n65 * Math.max(0, 6000 - 0.06 * Math.max(0, agi - (t.st === 'mfj' ? 150000 : 75000)))
  // SC first: it starts from AGI, and its tax is itemizable as SALT.
  const sp = scRules.params(t.y, t.scF).value
  let personal = 0
  for (const k of [0, 1] as const) {
    const cap = t.is65[k] ? sp.retirementDeduction.age65 : sp.retirementDeduction.under65
    const r = Math.min(Math.max(0, t.retireBy[k]), cap)
    personal += r + (t.is65[k] ? Math.max(0, sp.age65Deduction - r) : 0)
  }
  const frac = Math.max(0, agi - sp.sciad.phaseoutStart[t.st]) / sp.sciad.phaseoutDenominator[t.st]
  const sciad = frac >= 1 ? 0 : sp.sciad.amount[t.st] - Math.floor((sp.sciad.amount[t.st] * frac) / 10) * 10
  const scTi = Math.max(0, agi - tss - 0.44 * t.ltcg - personal - sciad)
  const scTax = Math.max(
    0,
    scTi < sp.rates.bracket ? scTi * sp.rates.lowRate : scTi * sp.rates.highRate - sp.rates.highSubtract,
  )
  const std = fp.standardDeduction[t.st] + fp.additional65[t.st] * t.n65
  let itemized =
    Math.min(saltCapRef(t.y, agi), scTax) +
    Math.max(0, t.medical - 0.075 * agi) +
    Math.max(0, t.charity - (t.y >= 2026 ? 0.005 * agi : 0))
  if (t.y >= 2026) {
    const top37 = fp.brackets[t.st][fp.brackets[t.st].length - 1]![0]
    itemized -= (2 / 37) * Math.min(itemized, Math.max(0, agi - senior - top37))
  }
  const ti = Math.max(0, agi - Math.max(std, itemized) - senior)
  const prefT = Math.min(pref, ti)
  const ordT = ti - prefT
  const [z, f15] = fp.ltcg[t.st]
  let cg = 0
  for (let x = 0; x < 1; x++) {
    const a0 = Math.max(0, Math.min(ti, z) - ordT)
    const a15 = Math.max(0, Math.min(ti, f15) - Math.max(ordT, z))
    cg = 0.15 * a15 + 0.2 * Math.max(0, prefT - a0 - a15)
  }
  const niit = 0.038 * Math.max(0, Math.min(t.interest + pref, agi - (t.st === 'mfj' ? 250000 : 200000)))
  const fed = brackets(ordT, fp.brackets[t.st]) + cg + niit
  return { total: fed + pay + scTax, ordT, magi: agi }
}

// ---------- engine ----------
type Acc = {
  kind: string
  owner: 0 | 1
  joint: boolean
  bal: number
  basis: number
  r: number
  yieldD: number
  cashRate: number
  target: number
  inh: null | { deadline: number | null; annual: boolean; first: number; div: number; sched: string }
  employer: boolean
  hsaMed: boolean
}

export function referenceRun(file: HouseholdFile, claimStr: string): RefRow[] {
  const sc = file.scenarios[0]!
  const hh = file.household
  const asm = sc.assumptions
  const infl = asm.inflation.mean
  const growth = infl + asm.realWageGrowth
  const base = mi(hh.baseDate)
  const baseY = Math.floor(base / 12)
  const pB = hh.people.primary.birthDate
  const sB = hh.people.spouse.birthDate
  const ip = ssaInfo(pB)
  const is = ssaInfo(sB)
  const claim = mi(claimStr)
  const deathP = ip.attain0 + (Math.floor(asm.mortality.deathAge.primary) + 1) * 12 - 1
  const deathS = is.attain0 + (Math.floor(asm.mortality.deathAge.spouse) + 1) * 12 - 1
  const endY = Math.max(ip.by, is.by) + sc.simulation.maxAge

  const earnP = new Map<number, number>()
  for (const r of hh.people.primary.earningsRecord) earnP.set(r.year, r.amount)
  for (const r of hh.people.primary.earnings) earnP.set(r.year, r.wages + r.selfEmployment * 0.9235)

  const sClaim = mi(hh.people.spouse.ss.claimedDate)
  const sPia0 = (hh.people.spouse.ss.currentMonthly + 0.5) / factorFor(sClaim, is.fraM, is.m70, 0)

  const presets: Record<string, [number, number]> = {
    conservative: [0.045, 0.07],
    moderate: [0.06, 0.11],
    aggressive: [0.075, 0.16],
    cash: [0.03, 0.01],
  }
  const accs: Acc[] = sc.accounts.map((a) => {
    const kind =
      a.type === 'traditional_ira' || a.type === 'traditional_401k'
        ? 'traditional'
        : a.type === 'roth_ira' || a.type === 'roth_401k'
          ? 'roth'
          : a.type === 'inherited_ira'
            ? `inherited_${a.flavor}`
            : a.type
    const mean = a.type === 'cash' ? a.rate : (a.return.mean ?? presets[a.return.preset ?? 'moderate']![0])
    const fee = a.type === 'cash' ? 0 : a.fee
    const shift = a.type === 'cash' ? 0 : asm.returns.realReturnShift
    let inh: Acc['inh'] = null
    let owner: 0 | 1 = 0
    if (a.type === 'inherited_ira') {
      owner = a.beneficiary === 'spouse' ? 1 : 0
      const [dy, dm] = parts(a.decedentDeathDate)
      const dby = parts(a.decedentBirthDate)[0]
      const rbdY = dby + rmdRules.rmdAge(dby) + 1
      const after = dy > rbdY || (dy === rbdY && dm >= 4)
      const benBy = parts(owner === 1 ? sB : pB)[0]
      const benLife = rmdRules.singleLife(dy + 1 - benBy)
      const ownLife = Math.max(1, rmdRules.singleLife(dy - dby) - 1)
      const edb = a.beneficiaryClass === 'eligible_designated'
      inh = {
        deadline: edb ? null : dy + 10,
        annual: edb ? true : a.flavor === 'traditional' && after,
        first: dy + 1,
        div: after ? Math.max(benLife, ownLife) : benLife,
        sched: a.schedule ?? sc.strategy.inheritedIraSchedule[a.flavor],
      }
    } else if ('owner' in a) owner = a.owner === 'spouse' ? 1 : 0
    return {
      kind,
      owner,
      joint: 'owner' in a && a.owner === 'joint',
      bal: a.balance,
      basis: a.type === 'taxable' ? (a.costBasis ?? a.balance) : 0,
      r: mean + shift - fee,
      yieldD: a.type === 'taxable' ? a.dividendYield : 0,
      cashRate: a.type === 'cash' ? a.rate : 0,
      target: a.type === 'cash' ? a.targetMonths : 0,
      inh,
      employer: a.type === 'traditional_401k' && a.currentEmployer,
      hsaMed: a.type === 'hsa' && a.payMedicalFirst,
    }
  })

  const magi = new Map<number, number>(Object.entries(hh.priorMagi).map(([k, v]) => [Number(k), v]))
  const tf = sc.trustFund
  const steps = (tf.preset === 'custom' ? tf.steps : ssaRules.trusteesPreset(tf.preset)).map(
    (s) => [mi(s.effective), s.payablePercent / 100] as const,
  )
  const hcut = (m: number) => {
    let f = 1
    for (const [from, v] of [...steps].sort((a, b) => a[0] - b[0])) if (m >= from) f = v
    return f
  }
  const cola = (py: number, inflArr: (y: number) => number) => ssaRules.cola(py) ?? Math.max(0, inflArr(py - 1))
  const inflAt = () => infl

  const rows: RefRow[] = []
  let P = 1
  let colaIdx = 1
  let withheld = 0
  for (let y = baseY; y <= endY; y++) {
    const m0 = y * 12
    if (deathP < m0 && deathS < m0) break
    if (y > baseY) colaIdx *= 1 + cola(y, inflAt)
    const st: St = deathP >= m0 && deathS >= m0 ? 'mfj' : 'single'
    const yi = y - baseY
    const med = P * (1 + sc.healthcare.medicalInflationSpread) ** yi
    const f = P * (1 + infl) ** (baseY - federalRules.latestYear)
    const scF = P * (1 + infl) ** (baseY - scRules.latestYear)
    const mF = P * (1 + infl) ** (baseY - medicareRules.latestYear)
    const mPrem = med * (1 + infl + sc.healthcare.medicalInflationSpread) ** (baseY - medicareRules.latestYear)
    const mp = medicareRules.params(y, mF, mPrem).value
    const startBal = accs.map((a) => a.bal)

    // SS for the year
    const { pia: basePiaP, elig } = basePiaRef(pB, earnP, y - 1, growth)
    let piaP = basePiaP
    for (let t = elig + 1; t <= y; t++) piaP = dime(piaP * (1 + cola(t, inflAt)))
    const piaS = sPia0 * colaIdx
    const ownS = Math.floor(hh.people.spouse.ss.currentMonthly * colaIdx)
    const nSp = Math.max(0, is.fraM - claim)
    const exc =
      Math.max(0, 0.5 * piaP - piaS) * (1 - (Math.min(36, nSp) * 25) / 3600 - (Math.max(0, nSp - 36) * 5) / 1200)
    const survRed = (start: number, info: ReturnType<typeof ssaInfo>) => {
      const e = info.sfraM - start
      if (e <= 0) return 0
      const span = info.sfra - 720
      return (0.285 * Math.min(e, span)) / span
    }
    const surv = (
      pia: number,
      info: ReturnType<typeof ssaInfo>,
      dclaim: number | null,
      death: number,
      sInfo: ReturnType<typeof ssaInfo>,
      start: number,
    ) => {
      let b: number
      if (dclaim !== null && dclaim <= death) b = pia * factorFor(dclaim, info.fraM, info.m70, 0)
      else if (death > info.fraM) b = pia * factorFor(death, info.fraM, info.m70, 0)
      else b = pia
      const early = dclaim !== null && dclaim <= death && b < pia
      const red = Math.max(b, pia) * (1 - survRed(start, sInfo))
      return early ? Math.min(red, Math.max(b, 0.825 * pia)) : Math.min(red, b)
    }
    const sOfP = surv(piaP, ip, claim, deathP, is, deathP + 1)
    const sOfS = surv(piaS, is, sClaim, deathS, ip, Math.max(deathS + 1, claim))
    const mP: number[] = []
    const mS: number[] = []
    const mX: number[] = []
    for (let k = 0; k < 12; k++) {
      const m = m0 + k
      let a = 0
      if (m <= deathP && m >= claim) {
        a = Math.floor(
          piaP * (m >= ip.fraM ? factorFor(claim, ip.fraM, ip.m70, withheld) : factorFor(claim, ip.fraM, ip.m70, 0)) +
            1e-9,
        )
        if (m > deathS) a = Math.max(a, Math.floor(sOfS))
      }
      let b = 0
      let x = 0
      if (m <= deathS && m >= sClaim) {
        b = ownS
        if (m <= deathP && m >= claim) x = Math.floor(exc)
        if (m > deathP) b = Math.max(b, Math.floor(sOfP))
      }
      mP.push(a)
      mS.push(b)
      mX.push(x)
    }
    const earnRow = (rowsE: { year: number; wages: number; selfEmployment: number }[], death: number) => {
      const r = rowsE.find((e) => e.year === y)
      if (!r) return [0, 0] as const
      const months = death < m0 + 11 ? Math.max(0, Math.min(12, death - m0 + 1)) : 12
      return [(r.wages * months) / 12, (r.selfEmployment * months) / 12] as const
    }
    const [wP, seP] = earnRow(hh.people.primary.earnings, deathP)
    const [wS, seS] = earnRow(hh.people.spouse.earnings, deathS)
    const lim = ssaRules.earningsTest(y, P * (1 + infl) ** (baseY - ssaRules.latestEarningsTestYear)).value
    const etest = (amts: number[], extra: number[] | null, fraM: number, earn: number) => {
      if (Math.floor(fraM / 12) < y || earn <= 0) return 0
      const ent: number[] = []
      for (let k = 0; k < 12; k++) if (amts[k]! > 0 && m0 + k < fraM) ent.push(k)
      if (ent.length === 0) return 0
      const avg = ent.reduce((s, k) => s + amts[k]! + (extra ? extra[k]! : 0), 0) / ent.length
      const fraYear = Math.floor(fraM / 12) === y
      const before = fraYear ? (earn * Math.max(0, Math.min(12, fraM - m0))) / 12 : earn
      const w = fraYear ? Math.max(0, before - lim.fraYear) / 3 : Math.max(0, earn - lim.underFra) / 2
      const n = Math.min(ent.length, Math.max(0, Math.ceil(w / avg - 1e-9)))
      for (let j = 0; j < n; j++) {
        amts[ent[j]!] = 0
        if (extra) extra[ent[j]!] = 0
      }
      return n
    }
    withheld += etest(mP, mX, ip.fraM, wP + seP * 0.9235)
    etest(mS, null, is.fraM, wS + seS * 0.9235)
    let ssP = 0
    let ssS = 0
    for (let k = 0; k < 12; k++) {
      ssP += mP[k]! * hcut(m0 + k)
      ssS += (mS[k]! + mX[k]!) * hcut(m0 + k)
    }

    // income streams
    let ordOther = 0
    let freeOther = 0
    for (const s of sc.income.streams) {
      const od = s.owner === 'primary' ? deathP : s.owner === 'spouse' ? deathS : Number.POSITIVE_INFINITY
      let end = s.end ? mi(s.end) : Number.POSITIVE_INFINITY
      if (od <= m0 + 11) end = Math.min(end, od)
      const months = Math.max(0, Math.min(end, m0 + 11) - Math.max(mi(s.start), m0) + 1)
      const idx =
        s.indexing === 'inflation'
          ? P
          : s.indexing === 'medical'
            ? med
            : s.indexing === 'none'
              ? 1
              : (1 + s.indexing) ** yi
      const v = (s.annual * idx * months) / 12
      if (s.tax === 'ordinary') ordOther += v
      else freeOther += v
    }
    let divs = 0
    let interest = 0
    for (const a of accs) {
      if (a.kind === 'taxable') divs += a.bal * a.yieldD
      if (a.kind === 'cash') interest += a.bal * a.cashRate
    }
    // required distributions
    let req = 0
    const reqOrd: [number, number] = [0, 0]
    for (const a of accs) {
      if (a.bal <= 0) continue
      let amt = 0
      if (a.kind === 'traditional') {
        const by = parts(a.owner === 0 ? pB : sB)[0]
        const w = a.owner === 0 ? wP : wS
        if (!(a.employer && w > 0) && y >= by + rmdRules.rmdAge(by)) amt = a.bal / rmdRules.uniformDivisor(y - by)
      } else if (a.inh) {
        const h = a.inh
        let reqd = 0
        if (h.deadline !== null && y >= h.deadline) reqd = a.bal
        else if (h.annual && y >= h.first) {
          const d = h.div - (y - h.first)
          reqd = d <= 1 ? a.bal : a.bal / d
        }
        amt = h.sched === 'even' && h.deadline !== null ? Math.max(reqd, a.bal / Math.max(1, h.deadline - y + 1)) : reqd
        amt = Math.min(amt, a.bal)
      }
      if (amt <= 0) continue
      a.bal -= amt
      req += amt
      if (a.kind === 'traditional' || a.kind === 'inherited_traditional') reqOrd[a.owner] += amt
    }
    // healthcare
    const lb = magi.get(y - 2) ?? 0
    let tier = 0
    for (const t of mp.thresholds[st]) if (lb > t) tier++
    let health = 0
    let hsaQ = 0
    const people = [
      { info: ip, death: deathP, pre: sc.healthcare.pre65.primary },
      { info: is, death: deathS, pre: sc.healthcare.pre65.spouse },
    ]
    for (const p of people) {
      const alive = Math.max(0, Math.min(12, p.death - m0 + 1))
      if (alive === 0) continue
      const last = m0 + alive - 1
      const pre = Math.max(0, Math.min(last, p.info.med - 1) - m0 + 1)
      const cobraStart = p.pre.start ? mi(p.pre.start) : base
      const cobra = Math.max(0, Math.min(last, p.info.med - 1) - Math.max(m0, cobraStart) + 1)
      const medM = alive - pre
      const partBD = medM * (mp.partBMonthlyTotal[tier]! + mp.partDBaseMonthly + mp.partDMonthlyAdd[tier]!)
      const oop = ((pre / 12) * p.pre.outOfPocket + (medM / 12) * sc.healthcare.medicare.outOfPocket) * med
      health +=
        cobra * p.pre.cobraMonthly * med + partBD + (medM / 12) * sc.healthcare.medicare.medigapAnnual * med + oop
      hsaQ += partBD + oop
    }
    let hsaUsed = 0
    for (const a of accs) {
      if (a.kind !== 'hsa' || !a.hsaMed) continue
      const t = Math.min(a.bal, hsaQ - hsaUsed)
      if (t <= 0) continue
      a.bal -= t
      hsaUsed += t
    }
    // expenses
    const first = Math.min(deathP, deathS)
    const survFrom = first <= m0 + 11 ? first + 1 : null
    let exp = 0
    let charity = 0
    let medicalItems = 0
    for (const e of sc.expenses.items) {
      const before = exp
      const idx =
        (e.indexing === 'inflation'
          ? P
          : e.indexing === 'medical'
            ? med
            : e.indexing === 'none'
              ? 1
              : (1 + e.indexing) ** yi) * asm.expenseScale
      const s = mi(e.start)
      if (e.oneTime) {
        if (Math.floor(s / 12) === y)
          exp += e.annual * idx * (e.perPerson && survFrom !== null && s >= survFrom ? sc.expenses.survivorFraction : 1)
      } else {
        for (let k = 0; k < 12; k++) {
          const m = m0 + k
          if (m < s || (e.end && m > mi(e.end))) continue
          const sf = e.perPerson && survFrom !== null && m >= survFrom ? sc.expenses.survivorFraction : 1
          exp += (e.annual * idx * sf) / 12
        }
      }
      if (e.deductible === 'charity') charity += exp - before
      else if (e.deductible === 'medical') medicalItems += exp - before
    }
    const spending = exp + health - hsaUsed

    const n65 = (deathP >= m0 && y - ip.by >= 65 ? 1 : 0) + (deathS >= m0 && y - is.by >= 65 ? 1 : 0)
    const tmax = maxOf(y, growth)
    const taxFor = (ordBy: [number, number], ltcg: number, pen: number) => {
      const r = taxRef({
        y,
        st,
        f,
        scF,
        n65,
        is65: [y - ip.by >= 65, y - is.by >= 65],
        tmax,
        wages: [wP, wS],
        se: [seP, seS],
        ordinary: reqOrd[0] + reqOrd[1] + ordOther + ordBy[0] + ordBy[1],
        retireBy: [reqOrd[0] + ordBy[0], reqOrd[1] + ordBy[1]],
        interest,
        divs,
        ltcg,
        ss: ssP + ssS,
        medical: health - hsaUsed + medicalItems,
        charity,
      })
      return { ...r, total: r.total + pen }
    }

    // withdrawals: allocation of a gross amount by strategy, solved by bisection
    const strat = sc.strategy
    const reserveOf = (a: Acc) => (a.kind === 'cash' ? (a.target * spending) / 12 : 0)
    const fp = federalRules.params(y, f).value
    const bTop = (() => {
      const b = fp.brackets[st]
      const i = b.findIndex(([, r]) => r === strat.targetBracket)
      return b[i + 1]?.[0] ?? Number.POSITIVE_INFINITY
    })()
    const near = (deathP >= m0 && y - ip.by >= 63) || (deathS >= m0 && y - is.by >= 63)
    const cap = near && strat.irmaaCapTier < 5 ? mp.thresholds[st][strat.irmaaCapTier]! : Number.POSITIVE_INFINITY
    const draw = (w: number[], kinds: string[], amt: number, useRes: boolean) => {
      let left = amt
      for (const k of kinds)
        accs.forEach((a, i) => {
          if (a.kind !== k || left <= 0) return
          const c = a.bal - (k === 'cash' && !useRes ? reserveOf(a) : 0) - w[i]!
          if (c <= 0) return
          const t = Math.min(c, left)
          w[i]! += t
          left -= t
        })
      return left
    }
    const evalW = (w: number[]) => {
      const ord: [number, number] = [0, 0]
      let lt = 0
      let pen = 0
      accs.forEach((a, i) => {
        const x = w[i]!
        if (a.kind === 'traditional' || a.kind === 'inherited_traditional') ord[a.owner] += x
        else if (a.kind === 'taxable' && a.bal > 0) lt += x * Math.max(0, 1 - a.basis / a.bal)
        else if (a.kind === 'hsa') {
          ord[a.owner] += x
          if (y - (a.owner === 0 ? ip.by : is.by) < 65) pen += 0.2 * x
        }
      })
      return taxFor(ord, lt, pen)
    }
    const TR = ['inherited_traditional', 'traditional']
    let room = 0
    if (strat.withdrawal === 'bracket_fill') {
      const okT = (t: number) => {
        const w = accs.map(() => 0)
        draw(w, TR, t, false)
        const r = evalW(w)
        return r.ordT <= bTop + 0.5 && r.magi <= cap + 0.5
      }
      const maxT = accs.filter((a) => TR.includes(a.kind)).reduce((s, a) => s + a.bal, 0)
      if (okT(maxT)) room = maxT
      else if (okT(0)) {
        let lo = 0
        let hi = maxT
        while (hi - lo > 1) {
          const mid = (lo + hi) / 2
          if (okT(mid)) lo = mid
          else hi = mid
        }
        room = lo
      }
    }
    const alloc = (g: number) => {
      const w = accs.map(() => 0)
      if (g <= 0) return w
      const conv = ['cash', 'taxable', 'inherited_traditional', 'traditional', 'inherited_roth', 'roth', 'hsa']
      if (strat.withdrawal === 'bracket_fill') {
        const t = Math.min(room, g)
        let left = g - (t - draw(w, TR, t, false))
        left = draw(
          w,
          ['cash', 'taxable', 'inherited_roth', 'roth', 'inherited_traditional', 'traditional', 'hsa'],
          left,
          false,
        )
        draw(w, ['cash'], left, true)
      } else if (strat.withdrawal === 'proportional') {
        const tot = accs.reduce((s, a) => s + Math.max(0, a.bal), 0)
        accs.forEach((a, i) => {
          w[i] = tot > 0 ? Math.max(0, a.bal) * Math.min(1, g / tot) : 0
        })
      } else {
        const order =
          strat.withdrawal === 'custom'
            ? [...strat.customOrder, ...conv.filter((k) => !(strat.customOrder as string[]).includes(k))]
            : conv
        draw(w, ['cash'], draw(w, order, g, false), true)
      }
      return w
    }
    const inflow = ssP + ssS + wP + seP + wS + seS + ordOther + freeOther + req
    const netOf = (g: number) => {
      const w = alloc(g)
      const t = evalW(w)
      return { w, t, net: inflow + w.reduce((s, v) => s + v, 0) - t.total }
    }
    let res = netOf(0)
    let shortfall = 0
    let surplus = 0
    if (res.net >= spending) surplus = res.net - spending
    else {
      const maxG = accs.reduce((s, a) => s + Math.max(0, a.bal), 0)
      const top = netOf(maxG)
      if (top.net <= spending) {
        res = top
        shortfall = spending - top.net
      } else {
        let lo = 0
        let hi = maxG
        res = top
        for (let it = 0; it < 200 && hi - lo > 0.001; it++) {
          const mid = (lo + hi) / 2
          const r = netOf(mid)
          if (r.net >= spending) {
            hi = mid
            res = r
            if (r.net - spending < 0.5) break
          } else lo = mid
        }
        surplus = res.net - spending
      }
    }
    accs.forEach((a, i) => {
      const x = res.w[i]!
      if (x <= 0) return
      if (a.kind === 'taxable' && a.bal > 0) a.basis -= a.basis * (Math.min(x, a.bal) / a.bal)
      a.bal -= x
    })
    if (surplus > 0) {
      let left = surplus
      const cash = accs.find((a) => a.kind === 'cash')
      if (cash) {
        const add = Math.min(left, Math.max(0, (cash.target * spending) / 12 - cash.bal))
        cash.bal += add
        left -= add
      }
      const tx = accs.find((a) => a.kind === 'taxable')
      if (tx) {
        tx.bal += left
        tx.basis += left
      } else if (cash) cash.bal += left
    }
    magi.set(y, res.t.magi)
    accs.forEach((a, i) => {
      const flow = a.bal - startBal[i]!
      if (a.kind === 'taxable') a.basis += startBal[i]! * a.yieldD
      a.bal = Math.max(0, startBal[i]! * (1 + a.r) + flow * Math.sqrt(Math.max(0, 1 + a.r)))
    })
    for (const [idx, d] of [deathP, deathS].entries()) {
      const other = idx === 0 ? deathS : deathP
      if (d < m0 || d > m0 + 11 || other <= d) continue
      for (const a of accs) if (a.owner === idx && !a.joint) a.owner = idx === 0 ? 1 : 0
    }
    rows.push({
      year: y,
      ss: [ssP, ssS],
      totalTax: res.t.total,
      drawn: res.w.reduce((s, v) => s + v, 0),
      required: req + hsaUsed,
      liquid: accs.reduce((s, a) => s + a.bal, 0),
      shortfall,
    })
    P *= 1 + infl
  }
  return rows
}
