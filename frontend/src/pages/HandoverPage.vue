<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { Artifact, Handover, Relation, Stratum } from '@/types'
import { buildHandoverNo } from '@/types'
import StratumDepthBar from '@/components/common/StratumDepthBar.vue'
import TrenchTag from '@/components/common/TrenchTag.vue'
import { useStore } from '@/hooks/usePersistentStore'
import { reviewTrench, type ReviewIssueKind } from '@/utils/review'
import { trenchStore } from '@/stores/trenchStore'
import { stratumStore } from '@/stores/stratumStore'
import { artifactStore } from '@/stores/artifactStore'
import { relationStore } from '@/stores/relationStore'
import { handoverStore } from '@/stores/handoverStore'
import { uid } from '@/utils/id'

const trenchState = useStore(trenchStore)
const stratumState = useStore(stratumStore)
const artifactState = useStore(artifactStore)
const relationState = useStore(relationStore)
const handoverState = useStore(handoverStore)

const selectedTrenchId = ref('')

const form = reactive({
  handoverBy: '',
  receiver: '',
  date: new Date().toISOString().slice(0, 10),
  note: ''
})

watch(
  () => trenchState.trenches.length,
  () => {
    if (!trenchState.trenches.some((item) => item.id === selectedTrenchId.value)) {
      selectedTrenchId.value = trenchState.trenches[0]?.id ?? ''
    }
  },
  { immediate: true }
)

const trench = computed(() => trenchState.trenches.find((item) => item.id === selectedTrenchId.value) ?? null)

/** 汇总该探方的地层单位、出土物、层位关系并逐项复核 */
const review = computed(() =>
  selectedTrenchId.value
    ? reviewTrench(selectedTrenchId.value, stratumState.strata, artifactState.artifacts, relationState.relations)
    : { strata: [] as Stratum[], artifacts: [] as Artifact[], relations: [] as Relation[], issues: [] }
)

const issues = computed(() => review.value.issues)
const artifactPieces = computed(() => review.value.artifacts.reduce((sum, item) => sum + item.count, 0))
const canConfirm = computed(() => Boolean(trench.value) && issues.value.length === 0)

const ISSUE_TAG: Record<ReviewIssueKind, 'danger' | 'warning'> = {
  层序倒置: 'danger',
  关系与深度矛盾: 'warning',
  出土深度越界: 'warning',
  缺失引用: 'danger'
}

/** 有异常的记录 id（按记录类型分组），用于明细表高亮 */
function flaggedIds(targetType: 'stratum' | 'artifact' | 'relation'): Set<string> {
  return new Set(issues.value.filter((item) => item.targetType === targetType).map((item) => item.targetId))
}

const flaggedStrata = computed(() => flaggedIds('stratum'))
const flaggedArtifacts = computed(() => flaggedIds('artifact'))
const flaggedRelations = computed(() => flaggedIds('relation'))

function stratumRowClass(param: { row: Stratum }): string {
  return flaggedStrata.value.has(param.row.id) ? 'inverted-row' : ''
}

function artifactRowClass(param: { row: Artifact }): string {
  return flaggedArtifacts.value.has(param.row.id) ? 'inverted-row' : ''
}

function relationRowClass(param: { row: Relation }): string {
  return flaggedRelations.value.has(param.row.id) ? 'inverted-row' : ''
}

function unitLabel(stratumId: string): string {
  return stratumState.strata.find((item) => item.id === stratumId)?.code ?? '缺失单位'
}

/** 该探方的历史交接留档（再次交接时旧记录仍可查） */
const history = computed(() => handoverState.handovers.filter((item) => item.trenchId === selectedTrenchId.value))

async function confirmHandover(): Promise<void> {
  if (!trench.value) return
  if (issues.value.length > 0) {
    ElMessage.error(`仍存在 ${issues.value.length} 项异常，接手人不能确认交接`)
    return
  }
  if (!form.handoverBy.trim() || !form.receiver.trim()) {
    ElMessage.warning('请填写交接人与接手人')
    return
  }
  if (!form.date) {
    ElMessage.warning('请选择交接日期')
    return
  }
  const row: Handover = {
    id: uid('hd'),
    trenchId: trench.value.id,
    handoverNo: buildHandoverNo(trench.value.code, form.date, history.value.length + 1),
    handoverBy: form.handoverBy.trim(),
    receiver: form.receiver.trim(),
    date: form.date,
    stratumCount: review.value.strata.length,
    artifactCount: review.value.artifacts.length,
    artifactPieces: artifactPieces.value,
    relationCount: review.value.relations.length,
    note: form.note.trim(),
    createdAt: new Date().toISOString()
  }
  await handoverStore.getState().save(row)
  ElMessage.success(`交接已留档，可追溯编号：${row.handoverNo}`)
  form.note = ''
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">交接复核</h2>
        <p class="page-sub">
          选定探方后汇总地层单位、出土物与层位关系，逐项复核层序倒置、关系与深度矛盾、出土深度越界与缺失引用；
          复核通过后方可填写交接人与日期，生成可追溯编号留档。
        </p>
      </div>
    </div>

    <div class="toolbar">
      <el-select v-model="selectedTrenchId" placeholder="选择探方" style="width: 200px">
        <el-option v-for="item in trenchState.trenches" :key="item.id" :label="`${item.area} · ${item.code}`" :value="item.id" />
      </el-select>
      <template v-if="trench">
        <TrenchTag :trench="trench" />
        <el-tag effect="plain">地层单位 {{ review.strata.length }} 个</el-tag>
        <el-tag effect="plain">出土物 {{ review.artifacts.length }} 条 / {{ artifactPieces }} 件</el-tag>
        <el-tag effect="plain">层位关系 {{ review.relations.length }} 条</el-tag>
        <el-tag :type="issues.length > 0 ? 'danger' : 'success'" effect="dark">异常 {{ issues.length }} 项</el-tag>
      </template>
    </div>

    <template v-if="trench">
      <el-alert
        v-if="issues.length > 0"
        class="alert"
        type="error"
        :closable="false"
        show-icon
        :title="`发现 ${issues.length} 项异常，接手人暂不能确认交接`"
      >
        <template #default>
          请按下方清单逐项核对处理；异常处理完成后复核结果会自动更新。明细数据不受影响，可正常查看。
        </template>
      </el-alert>
      <el-alert
        v-else
        class="alert"
        type="success"
        :closable="false"
        show-icon
        title="复核通过：未发现层序倒置、关系与深度矛盾、出土深度越界或缺失引用，可办理交接"
      />

      <el-card v-if="issues.length > 0" shadow="never" class="card">
        <template #header>异常清单（{{ issues.length }}）—— 按记录定位</template>
        <el-table :data="issues" border stripe>
          <el-table-column label="异常类别" width="140">
            <template #default="{ row }">
              <el-tag :type="ISSUE_TAG[row.kind as ReviewIssueKind]" size="small" effect="dark">{{ row.kind }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="问题记录" width="220">
            <template #default="{ row }">
              <span class="mono">{{ row.targetLabel }}</span>
            </template>
          </el-table-column>
          <el-table-column label="异常说明" min-width="320">
            <template #default="{ row }">{{ row.detail }}</template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card shadow="never" class="card">
        <template #header>编目明细（异常记录已标红，复核不通过也可查看）</template>
        <el-tabs>
          <el-tab-pane :label="`地层单位（${review.strata.length}）`">
            <el-table :data="review.strata" border stripe row-key="id" :row-class-name="stratumRowClass" max-height="360">
              <el-table-column label="单位号" width="100">
                <template #default="{ row }: { row: Stratum }"><span class="mono">{{ row.code }}</span></template>
              </el-table-column>
              <el-table-column label="类型" width="100">
                <template #default="{ row }: { row: Stratum }">
                  <TrenchTag :unit-type="row.type" size="small" />
                </template>
              </el-table-column>
              <el-table-column label="深度刻度" width="230">
                <template #default="{ row }: { row: Stratum }">
                  <StratumDepthBar :stratum="row" :length="160" />
                </template>
              </el-table-column>
              <el-table-column prop="openLayer" label="开口层位" width="110" />
              <el-table-column prop="soil" label="土质土色" min-width="160" show-overflow-tooltip />
              <el-table-column prop="drawingNo" label="绘图/拍照号" width="150" show-overflow-tooltip />
            </el-table>
          </el-tab-pane>
          <el-tab-pane :label="`出土物（${review.artifacts.length}）`">
            <el-table :data="review.artifacts" border stripe row-key="id" :row-class-name="artifactRowClass" max-height="360">
              <el-table-column label="器物编号" width="140">
                <template #default="{ row }: { row: Artifact }"><span class="mono">{{ row.code }}</span></template>
              </el-table-column>
              <el-table-column label="所属单位" width="100">
                <template #default="{ row }: { row: Artifact }"><span class="mono">{{ unitLabel(row.stratumId) }}</span></template>
              </el-table-column>
              <el-table-column prop="category" label="类别" width="90" />
              <el-table-column prop="count" label="件数" width="80" />
              <el-table-column label="出土坐标 (X,Y,Z)" width="160">
                <template #default="{ row }: { row: Artifact }">{{ row.x }}, {{ row.y }}, {{ row.z }}</template>
              </el-table-column>
              <el-table-column prop="date" label="出土日期" width="120" />
              <el-table-column prop="collector" label="提取人" width="90" />
              <el-table-column prop="tempLocation" label="临时存放" min-width="140" show-overflow-tooltip />
            </el-table>
          </el-tab-pane>
          <el-tab-pane :label="`层位关系（${review.relations.length}）`">
            <el-table :data="review.relations" border stripe row-key="id" :row-class-name="relationRowClass" max-height="360">
              <el-table-column label="单位 A" width="110">
                <template #default="{ row }: { row: Relation }"><span class="mono">{{ unitLabel(row.unitAId) }}</span></template>
              </el-table-column>
              <el-table-column label="关系" width="90">
                <template #default="{ row }: { row: Relation }">
                  <el-tag size="small" effect="dark">{{ row.type }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="单位 B" width="110">
                <template #default="{ row }: { row: Relation }"><span class="mono">{{ unitLabel(row.unitBId) }}</span></template>
              </el-table-column>
              <el-table-column prop="basis" label="判定依据" width="110" />
              <el-table-column prop="recorder" label="记录人" width="100" />
              <el-table-column prop="note" label="备注" min-width="180" show-overflow-tooltip />
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </el-card>

      <el-card shadow="never" class="card">
        <template #header>
          <div class="card-head">
            <span>确认交接</span>
            <span v-if="!canConfirm" class="muted">存在异常，接手人不能确认交接</span>
          </div>
        </template>
        <el-form label-width="90px" class="handover-form">
          <el-row :gutter="12">
            <el-col :span="8">
              <el-form-item label="交接人" required>
                <el-input v-model="form.handoverBy" :disabled="!canConfirm" placeholder="交出方记录员" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="接手人" required>
                <el-input v-model="form.receiver" :disabled="!canConfirm" placeholder="接收方整理人" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="交接日期" required>
                <el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" :disabled="!canConfirm" style="width: 100%" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="备注">
            <el-input v-model="form.note" :disabled="!canConfirm" placeholder="如 档案随探方回填一并移交整理室" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :disabled="!canConfirm" @click="confirmHandover">
              确认交接并留档
            </el-button>
            <span v-if="!canConfirm" class="muted blocked">需先处理上方 {{ issues.length }} 项异常</span>
            <span v-else class="muted blocked">留档后生成可追溯编号，旧记录不可删改</span>
          </el-form-item>
        </el-form>
      </el-card>

      <el-card shadow="never" class="card">
        <template #header>交接留档（{{ trench.area }} · {{ trench.code }}，共 {{ history.length }} 次）</template>
        <el-table :data="history" border stripe row-key="id">
          <el-table-column label="可追溯编号" width="220">
            <template #default="{ row }: { row: Handover }"><span class="mono">{{ row.handoverNo }}</span></template>
          </el-table-column>
          <el-table-column prop="handoverBy" label="交接人" width="100" />
          <el-table-column prop="receiver" label="接手人" width="100" />
          <el-table-column prop="date" label="交接日期" width="120" />
          <el-table-column label="留档时快照" min-width="220">
            <template #default="{ row }: { row: Handover }">
              单位 {{ row.stratumCount }} · 出土物 {{ row.artifactCount }} 条/{{ row.artifactPieces }} 件 · 关系 {{ row.relationCount }}
            </template>
          </el-table-column>
          <el-table-column prop="note" label="备注" min-width="160" show-overflow-tooltip />
          <el-table-column label="留档时间" width="170">
            <template #default="{ row }: { row: Handover }">{{ row.createdAt.slice(0, 19).replace('T', ' ') }}</template>
          </el-table-column>
          <template #empty>该探方尚未办理过交接</template>
        </el-table>
      </el-card>
    </template>
    <el-empty v-else description="暂无探方，请先在「探方清单」中新建探方" />
  </div>
</template>

<style scoped>
.alert {
  margin-bottom: 14px;
}
.card {
  border-radius: 12px;
  margin-bottom: 16px;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.handover-form {
  max-width: 900px;
}
.blocked {
  margin-left: 10px;
}
</style>
