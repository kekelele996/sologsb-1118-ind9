/** Handover 交接留档记录 */
export interface Handover {
  id: string
  /** 可追溯编号，如 JJ-T0501-20260926-01 */
  serial: string
  trenchId: string
  /** 留档时的探方标识快照（如 Ⅱ区 · T0501），探方后续变动不影响档案 */
  trenchLabel: string
  /** 交出人 */
  handoverBy: string
  /** 接手人 */
  receiver: string
  /** 交接日期 */
  date: string
  /** 汇总快照：地层单位数 */
  strataCount: number
  /** 汇总快照：出土物件数 */
  artifactCount: number
  /** 汇总快照：层位关系数 */
  relationCount: number
  /** 留档时间（ISO 字符串） */
  createdAt: string
}

/** 生成可追溯编号：JJ-探方号-交接日期-该探方第几次交接 */
export function handoverSerial(trenchCode: string, date: string, seq: number): string {
  const day = date.replace(/-/g, '')
  return `JJ-${trenchCode.trim().toUpperCase()}-${day}-${String(seq).padStart(2, '0')}`
}
