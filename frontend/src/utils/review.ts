import type { Artifact, Relation, Stratum } from '@/types'
import { isDepthInverted } from '@/types'

/** 交接复核的异常类别 */
export type ReviewIssueKind = '层序倒置' | '关系与深度矛盾' | '出土深度越界' | '缺失引用'

/** 异常指向的记录类型 */
export type ReviewTargetType = 'stratum' | 'artifact' | 'relation'

export interface ReviewIssue {
  kind: ReviewIssueKind
  targetType: ReviewTargetType
  targetId: string
  /** 问题记录定位文字，如「地层单位 H12」 */
  targetLabel: string
  /** 异常说明 */
  detail: string
}

export interface TrenchReview {
  /** 该探方下的地层单位 */
  strata: Stratum[]
  /** 归属于这些单位的出土物 */
  artifacts: Artifact[]
  /** 涉及这些单位的层位关系 */
  relations: Relation[]
  /** 复核发现的异常（空数组 = 可交接） */
  issues: ReviewIssue[]
}

/**
 * 汇总某个探方的编目记录并逐项复核：
 * - 层序倒置：单位上界深度大于下界深度；
 * - 关系与深度矛盾：A 叠压/打破 B，但 A 的上界深度比 B 更深；
 * - 出土深度越界：出土物 Z 深度不在所属单位的深度区间内；
 * - 缺失引用：层位关系引用了不存在的地层单位。
 */
export function reviewTrench(
  trenchId: string,
  allStrata: Stratum[],
  allArtifacts: Artifact[],
  allRelations: Relation[]
): TrenchReview {
  const strata = allStrata.filter((item) => item.trenchId === trenchId)
  const unitIds = new Set(strata.map((item) => item.id))
  const stratumById = new Map(allStrata.map((item) => [item.id, item]))

  const artifacts = allArtifacts.filter((item) => unitIds.has(item.stratumId))
  const relations = allRelations.filter((item) => unitIds.has(item.unitAId) || unitIds.has(item.unitBId))

  const issues: ReviewIssue[] = []

  strata.forEach((item) => {
    if (isDepthInverted(item)) {
      issues.push({
        kind: '层序倒置',
        targetType: 'stratum',
        targetId: item.id,
        targetLabel: `地层单位 ${item.code}`,
        detail: `上界深度 ${item.topDepth} m 大于下界深度 ${item.bottomDepth} m，层序倒置`
      })
    }
  })

  relations.forEach((relation) => {
    const a = stratumById.get(relation.unitAId)
    const b = stratumById.get(relation.unitBId)
    const label = `层位关系 ${a?.code ?? '缺失单位'} ${relation.type} ${b?.code ?? '缺失单位'}`
    if (!a || !b) {
      const missing = [!a ? '单位 A' : '', !b ? '单位 B' : ''].filter(Boolean).join('、')
      issues.push({
        kind: '缺失引用',
        targetType: 'relation',
        targetId: relation.id,
        targetLabel: label,
        detail: `${missing}引用的地层单位不存在（判定依据：${relation.basis}，记录人：${relation.recorder || '未填'}）`
      })
      return
    }
    if (relation.type !== '共存' && a.topDepth > b.topDepth) {
      issues.push({
        kind: '关系与深度矛盾',
        targetType: 'relation',
        targetId: relation.id,
        targetLabel: `层位关系 ${a.code} ${relation.type} ${b.code}`,
        detail: `${a.code} 上界深度 ${a.topDepth} m 大于 ${b.code} 的 ${b.topDepth} m，与「${relation.type}」关系矛盾`
      })
    }
  })

  artifacts.forEach((artifact) => {
    const stratum = stratumById.get(artifact.stratumId)
    if (!stratum) {
      issues.push({
        kind: '缺失引用',
        targetType: 'artifact',
        targetId: artifact.id,
        targetLabel: `出土物 ${artifact.code}`,
        detail: '所属地层单位不存在，出土物脱离层位上下文'
      })
      return
    }
    if (artifact.z < stratum.topDepth || artifact.z > stratum.bottomDepth) {
      issues.push({
        kind: '出土深度越界',
        targetType: 'artifact',
        targetId: artifact.id,
        targetLabel: `出土物 ${artifact.code}`,
        detail: `出土深度 ${artifact.z} m 不在单位「${stratum.code}」的深度区间 ${stratum.topDepth}–${stratum.bottomDepth} m 内`
      })
    }
  })

  return { strata, artifacts, relations, issues }
}
