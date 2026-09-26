<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { Handover } from '@/types'
import { handoverSerial } from '@/types'
import TrenchTag from '@/components/common/TrenchTag.vue'
import { useStore } from '@/hooks/usePersistentStore'
import { trenchStore } from '@/stores/trenchStore'
import { stratumStore } from '@/stores/stratumStore'
import { artifactStore } from '@/stores/artifactStore'
import { relationStore } from '@/stores/relationStore'
import { handoverStore } from '@/stores/handoverStore'
import { ISSUE_KIND_LABELS, reviewTrench, type IssueKind } from '@/utils/review'
import { uid } from '@/utils/id'

const trenchState = useStore(trenchStore)
const stratumState = useStore(stratumStore)
const artifactState = useStore(artifactStore)
const relationState = useStore(relationStore)
const handoverState = useStore(handoverStore)

const trenchId = ref('')
const activeTab = ref('strata')

const form = reactive({
  handoverBy: '',
  receiver: '',
  date: new Date().toISOString().slice(0, 10)
})

const trench = computed(() => trenchState.trenches.find((item) => item.id === trenchId.value) ?? null)

/** 汇总当前探方的编目记录并复核 */
const review = computed(() =>
  trenchId.value
    ? reviewTrench(trenchId.value, stratumState.strata, artifactState.artifacts, relationState.relations)
    : null
)

const artifactPieces = computed(() => (review.value ? review.value.artifacts.reduce((sum, item) => sum + item.count, 0) : 0))

/** 当前探方的历史交接记录（新→旧） */
const history = computed(() => handoverState.handovers.filter((item) => item.trenchId === trenchId.value))

const ISSUE_TAG_TYPES: Record<IssueKind, 'danger' | 'warning'> = {
  inverted: 'danger',
  conflict: 'warning',
  outOfRange: 'warning',
  missingRef: 'danger'
}

watch(
  () => trenchState.trenches.length,
  () => {
    if (!trenchState.trenches.some((item) => item.id === trenchId.value)) {
      trenchId.value = trenchState.trenches[0]?.id ?? ''
    }
  },
  { immediate: true }
)

/** 切换探方时带出现任负责人作为默认交出人 */
watch(
  trench,
  (value) => {
    form.handoverBy = value?.leader ?? ''
    form.receiver = ''
  },
  { immediate: true }
)

function unitCode(stratumId: string): string {
  return stratumState.strata.find((item) => item.id === stratumId)?.code ?? '未知单位'
}

function stratumRowClass(param: { row: { id: string } }): string {
  return review.value?.flagged.strata.has(param.row.id) ? 'inverted-row' : ''
}

function artifactRowClass(param: { row: { id: string } }): string {
  return review.value?.flagged.artifacts.has(param.row.id) ? 'inverted-row' : ''
}

function relationRowClass(param: { row: { id: string } }): string {
  return review.value?.flagged.relations.has(param.row.id) ? 'inverted-row' : ''
}

async function confirmHandover(): Promise<void> {
  if (!trench.value || !review.value) return
  if (review.value.issues.length > 0) {
    ElMessage.error(`仍存在 ${review.value.issues.length} 项异常，接手人不能确认交接`)
    return
  }
  if (!form.handoverBy.trim() || !form.receiver.trim()) {
    ElMessage.warning('请填写交出人与接手人')
    return
  }
  if (!form.date) {
    ElMessage.warning('请选择交接日期')
    return
  }
  const seq = history.value.length + 1
  const record: Handover = {
    id: uid('ho'),
    serial: handoverSerial(trench.value.code, form.date, seq),
    trenchId: trench.value.id,
    trenchLabel: `${trench.value.area} · ${trench.value.code}`,
    handoverBy: form.handoverBy.trim(),
    receiver: form.receiver.trim(),
    date: form.date,
    strataCount: review.value.strata.length,
    artifactCount: artifactPieces.value,
    relationCount: review.value.relations.length,
    createdAt: new Date().toISOString()
  }
  await handoverStore.getState().save(record)
  ElMessage.success(`交接已留档，可追溯编号 ${record.serial}`)
  form.receiver = ''
}

function formatTime(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ')
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">交接复核</h2>
        <p class="page-sub">
          选定探方后汇总其地层单位、出土物与层位关系，逐项核对层序倒置、关系与深度矛盾、出土深度越界与缺失引用；存在异常时接手人不能确认交接，全部通过后方可留档并生成可追溯编号。
        </p>
      </div>
      <el-select v-model="trenchId" placeholder="选择探方" style="width: 200px">
        <el-option v-for="item in trenchState.trenches" :key="item.id" :label="`${item.area} · ${item.code}`" :value="item.id" />
      </el-select>
    </div>

    <el-empty v-if="!trench" description="暂无探方，请先在「探方清单」中新建" />

    <template v-else-if="review">
      <div class="toolbar">
        <TrenchTag :trench="trench" />
        <el-tag effect="plain">地层单位 {{ review.strata.length }} 个</el-tag>
        <el-tag effect="plain">出土物 {{ review.artifacts.length }} 条 / {{ artifactPieces }} 件</el-tag>
        <el-tag effect="plain">层位关系 {{ review.relations.length }} 条</el-tag>
        <el-tag :type="review.issues.length > 0 ? 'danger' : 'success'" effect="plain">
          异常 {{ review.issues.length }} 项
        </el-tag>
        <el-tag type="info" effect="plain">历史交接 {{ history.length }} 次</el-tag>
      </div>

      <el-alert
        v-if="review.issues.length > 0"
        class="alert"
        type="error"
        :closable="false"
        show-icon
        :title="`发现 ${review.issues.length} 项异常，接手人暂不能确认交接（明细仍可查看，异常记录已标红）`"
      />
      <el-alert
        v-else
        class="alert"
        type="success"
        :closable="false"
        show-icon
        title="复核通过：未发现层序倒置、关系与深度矛盾、出土深度越界或缺失引用，可确认交接"
      />

      <div class="layout">
        <div class="main-col">
          <el-card shadow="never" class="card">
            <template #header>
              <div class="card-head">
                <span>异常清单（{{ review.issues.length }}）</span>
                <span class="muted">逐条指出出问题的记录</span>
              </div>
            </template>
            <el-table :data="review.issues" border stripe>
              <el-table-column label="异常类型" width="140">
                <template #default="{ row }">
                  <el-tag :type="ISSUE_TAG_TYPES[row.kind as IssueKind]" size="small" effect="dark">
                    {{ ISSUE_KIND_LABELS[row.kind as IssueKind] }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="记录定位" width="220">
                <template #default="{ row }">
                  <span class="mono">{{ row.target }}</span>
                </template>
              </el-table-column>
              <el-table-column label="具体说明" min-width="280">
                <template #default="{ row }">{{ row.detail }}</template>
              </el-table-column>
              <template #empty>未发现异常，档案可以交接</template>
            </el-table>
          </el-card>

          <el-card shadow="never" class="card">
            <template #header>
              <div class="card-head">
                <span>档案明细</span>
                <span class="muted">异常记录整行标红</span>
              </div>
            </template>
            <el-tabs v-model="activeTab">
              <el-tab-pane :label="`地层单位（${review.strata.length}）`" name="strata">
                <el-table :data="review.strata" border stripe row-key="id" :row-class-name="stratumRowClass" max-height="360">
                  <el-table-column prop="code" label="单位号" width="100">
                    <template #default="{ row }"><span class="mono">{{ row.code }}</span></template>
                  </el-table-column>
                  <el-table-column prop="type" label="类型" width="90" />
                  <el-table-column label="深度区间（m）" width="140">
                    <template #default="{ row }">{{ row.topDepth }} – {{ row.bottomDepth }}</template>
                  </el-table-column>
                  <el-table-column prop="openLayer" label="开口层位" width="110" />
                  <el-table-column prop="soil" label="土质土色" min-width="180" show-overflow-tooltip />
                  <el-table-column label="出土物" width="90">
                    <template #default="{ row }">
                      {{ review.artifacts.filter((item) => item.stratumId === row.id).length }} 条
                    </template>
                  </el-table-column>
                </el-table>
              </el-tab-pane>
              <el-tab-pane :label="`出土物（${review.artifacts.length}）`" name="artifacts">
                <el-table :data="review.artifacts" border stripe row-key="id" :row-class-name="artifactRowClass" max-height="360">
                  <el-table-column prop="code" label="器物编号" width="140">
                    <template #default="{ row }"><span class="mono">{{ row.code }}</span></template>
                  </el-table-column>
                  <el-table-column label="所属单位" width="100">
                    <template #default="{ row }"><span class="mono">{{ unitCode(row.stratumId) }}</span></template>
                  </el-table-column>
                  <el-table-column prop="category" label="类别" width="90" />
                  <el-table-column prop="count" label="件数" width="80" />
                  <el-table-column prop="z" label="Z 深度（m）" width="110" />
                  <el-table-column prop="date" label="出土日期" width="120" />
                  <el-table-column prop="collector" label="提取人" width="90" />
                  <el-table-column prop="tempLocation" label="临时存放" min-width="140" show-overflow-tooltip />
                </el-table>
              </el-tab-pane>
              <el-tab-pane :label="`层位关系（${review.relations.length}）`" name="relations">
                <el-table :data="review.relations" border stripe row-key="id" :row-class-name="relationRowClass" max-height="360">
                  <el-table-column label="单位 A" width="110">
                    <template #default="{ row }"><span class="mono">{{ unitCode(row.unitAId) }}</span></template>
                  </el-table-column>
                  <el-table-column prop="type" label="关系" width="90">
                    <template #default="{ row }">
                      <el-tag size="small" effect="dark">{{ row.type }}</el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column label="单位 B" width="110">
                    <template #default="{ row }"><span class="mono">{{ unitCode(row.unitBId) }}</span></template>
                  </el-table-column>
                  <el-table-column prop="basis" label="判定依据" width="110" />
                  <el-table-column prop="recorder" label="记录人" width="90" />
                  <el-table-column prop="note" label="备注" min-width="180" show-overflow-tooltip />
                </el-table>
              </el-tab-pane>
            </el-tabs>
          </el-card>
        </div>

        <div class="side-col">
          <el-card shadow="never" class="card">
            <template #header>确认交接</template>
            <el-alert
              v-if="review.issues.length > 0"
              type="warning"
              :closable="false"
              show-icon
              title="存在异常，接手人不能确认交接"
              class="confirm-alert"
            />
            <el-form label-width="80px" size="small">
              <el-form-item label="交出人">
                <el-input v-model="form.handoverBy" placeholder="交出档案的负责人" />
              </el-form-item>
              <el-form-item label="接手人">
                <el-input v-model="form.receiver" placeholder="确认接收档案的人" />
              </el-form-item>
              <el-form-item label="交接日期">
                <el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
              </el-form-item>
            </el-form>
            <el-button
              type="primary"
              style="width: 100%"
              :disabled="review.issues.length > 0"
              @click="confirmHandover"
            >
              确认交接并留档
            </el-button>
            <p class="muted hint">
              留档后生成「JJ-探方号-日期-序号」可追溯编号；交接记录只增不删，同一探方再次交接时历史记录仍可查询。
            </p>
          </el-card>

          <el-card shadow="never" class="card">
            <template #header>交接留档（{{ history.length }}）</template>
            <ul v-if="history.length > 0" class="history">
              <li v-for="item in history" :key="item.id">
                <div class="serial mono">{{ item.serial }}</div>
                <div class="meta">
                  {{ item.date }} · {{ item.handoverBy }} → {{ item.receiver }}
                </div>
                <div class="meta muted">
                  单位 {{ item.strataCount }} · 出土物 {{ item.artifactCount }} 件 · 关系 {{ item.relationCount }} · 留档于
                  {{ formatTime(item.createdAt) }}
                </div>
                <div class="meta muted">{{ item.trenchLabel }}</div>
              </li>
            </ul>
            <p v-else class="muted">该探方尚无交接记录</p>
          </el-card>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.alert {
  margin-bottom: 14px;
}
.layout {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
}
.main-col {
  flex: 1 1 620px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.side-col {
  flex: 1 1 300px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.card {
  border-radius: 12px;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.confirm-alert {
  margin-bottom: 12px;
}
.hint {
  margin: 10px 0 0;
  line-height: 1.6;
}
.history {
  margin: 0;
  padding: 0;
  list-style: none;
}
.history li {
  padding: 8px 0;
  border-bottom: 1px dotted #e6ded0;
}
.history li:last-child {
  border-bottom: none;
}
.serial {
  font-size: 13px;
  font-weight: 600;
  color: #8a5a2b;
}
.meta {
  font-size: 12px;
  margin-top: 2px;
}
</style>
