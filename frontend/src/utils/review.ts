import type { Artifact, Relation, Stratum } from '@/types'
import { isDepthInverted } from '@/types'

/** 交接复核异常类型 */
export type IssueKind = 'inverted' | 'conflict' | 'outOfRange' | 'missingRef'

export const ISSUE_KIND_LABELS: Record<IssueKind, string> = {
  inverted: '层序倒置',
  conflict: '关系与深度矛盾',
  outOfRange: '出土深度越界',
  missingRef: '缺失引用'
}

export interface ReviewIssue {
  kind: IssueKind
  /** 出问题的记录 id（用于明细表定位高亮） */
  recordId: string
  /** 记录定位，如「地层单位 H12」「出土物 T0501②:1」 */
  target: string
  /** 具体说明 */
  detail: string
}

export interface TrenchReview {
  strata: Stratum[]
  artifacts: Artifact[]
  relations: Relation[]
  issues: ReviewIssue[]
  /** 各明细表中需要标红的记录 id */
  flagged: {
    strata: Set<string>
    artifacts: Set<string>
    relations: Set<string>
  }
}

/**
 * 汇总某个探方的编目记录并逐项复核：
 * - 层序倒置：单位上界深度大于下界深度；
 * - 关系与深度矛盾：A 叠压/打破 B，但 A 的上界深度比 B 更深；
 * - 出土深度越界：出土物 Z 深度不在所属单位的深度区间内（与登记校验口径一致）；
 * - 缺失引用：层位关系引用了不存在的单位。
 */
export function reviewTrench(
  trenchId: string,
  strataAll: Stratum[],
  artifactsAll: Artifact[],
  relationsAll: Relation[]
): TrenchReview {
  const strata = strataAll.filter((item) => item.trenchId === trenchId)
  const unitIds = new Set(strata.map((item) => item.id))
  const artifacts = artifactsAll.filter((item) => unitIds.has(item.stratumId))
  const relations = relationsAll.filter((item) => unitIds.has(item.unitAId) || unitIds.has(item.unitBId))
  const stratumById = new Map(strataAll.map((item) => [item.id, item]))

  const issues: ReviewIssue[] = []
  const flagged = {
    strata: new Set<string>(),
    artifacts: new Set<string>(),
    relations: new Set<string>()
  }

  // 层序倒置
  strata.forEach((stratum) => {
    if (!isDepthInverted(stratum)) return
    flagged.strata.add(stratum.id)
    issues.push({
      kind: 'inverted',
      recordId: stratum.id,
      target: `地层单位 ${stratum.code}`,
      detail: `上界深度 ${stratum.topDepth} m 大于下界深度 ${stratum.bottomDepth} m，层序倒置`
    })
  })

  // 关系与深度矛盾 / 缺失引用
  relations.forEach((relation) => {
    const a = stratumById.get(relation.unitAId)
    const b = stratumById.get(relation.unitBId)
    const labelA = a?.code ?? `未知单位(${relation.unitAId})`
    const labelB = b?.code ?? `未知单位(${relation.unitBId})`
    if (!a || !b) {
      const missing = [!a ? `单位 A「${labelA}」` : null, !b ? `单位 B「${labelB}」` : null]
        .filter(Boolean)
        .join('、')
      flagged.relations.add(relation.id)
      issues.push({
        kind: 'missingRef',
        recordId: relation.id,
        target: `层位关系 ${labelA} ${relation.type} ${labelB}`,
        detail: `${missing}不存在（可能已删除），关系记录失去引用`
      })
      return
    }
    if (relation.type !== '共存' && a.topDepth > b.topDepth) {
      flagged.relations.add(relation.id)
      issues.push({
        kind: 'conflict',
        recordId: relation.id,
        target: `层位关系 ${a.code} ${relation.type} ${b.code}`,
        detail: `${a.code} 上界深度（${a.topDepth} m）大于 ${b.code}（${b.topDepth} m），层位关系与深度矛盾`
      })
    }
  })

  // 出土深度越界
  artifacts.forEach((artifact) => {
    const stratum = stratumById.get(artifact.stratumId)
    if (!stratum) {
      flagged.artifacts.add(artifact.id)
      issues.push({
        kind: 'missingRef',
        recordId: artifact.id,
        target: `出土物 ${artifact.code}`,
        detail: `所属地层单位（${artifact.stratumId}）不存在（可能已删除），出土物失去层位上下文`
      })
      return
    }
    if (artifact.z < stratum.topDepth || artifact.z > stratum.bottomDepth) {
      flagged.artifacts.add(artifact.id)
      issues.push({
        kind: 'outOfRange',
        recordId: artifact.id,
        target: `出土物 ${artifact.code}`,
        detail: `出土深度 ${artifact.z} m 不在所属单位 ${stratum.code} 的深度区间（${stratum.topDepth}–${stratum.bottomDepth} m）内`
      })
    }
  })

  return { strata, artifacts, relations, issues, flagged }
}
