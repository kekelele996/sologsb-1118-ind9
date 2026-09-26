/** Handover 交接留档（复核通过后生成，不可删除，保证可追溯） */
export interface Handover {
  id: string
  trenchId: string
  /** 可追溯编号，如 JJ-T0501-20260926-01 */
  handoverNo: string
  /** 交接人（交出方） */
  handoverBy: string
  /** 接手人（确认方） */
  receiver: string
  /** 交接日期 */
  date: string
  /** 留档时的记录快照：地层单位数 */
  stratumCount: number
  /** 留档时的记录快照：出土物条数 */
  artifactCount: number
  /** 留档时的记录快照：出土物总件数 */
  artifactPieces: number
  /** 留档时的记录快照：层位关系数 */
  relationCount: number
  note: string
  /** 留档时间（ISO 时间戳） */
  createdAt: string
}

/** 生成交接编号：JJ-探方号-交接日期-序号（同一探方内序号递增） */
export function buildHandoverNo(trenchCode: string, date: string, seq: number): string {
  const compact = date.replace(/-/g, '')
  return `JJ-${trenchCode.trim().toUpperCase()}-${compact}-${String(seq).padStart(2, '0')}`
}
