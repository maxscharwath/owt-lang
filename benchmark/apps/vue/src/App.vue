<script setup lang="ts">
// Mirrors frameworks/keyed/vue in js-framework-benchmark: rows live in a
// shallowRef (replaced on structural changes), each label is its own ref so
// "update every 10th row" only touches label refs.
import { ref, shallowRef, type Ref } from 'vue';
import { buildData as buildRows } from '../../../shared/data';

interface Row {
  id: number;
  label: Ref<string>;
}

function buildData(count = 1000): Row[] {
  return buildRows(count).map(({ id, label }) => ({ id, label: ref(label) }));
}

const selected = ref<number>();
const rows = shallowRef<Row[]>([]);

function setRows(update = rows.value.slice()) {
  rows.value = update;
}

function add() {
  rows.value = rows.value.concat(buildData(1000));
}

function remove(id: number) {
  rows.value.splice(
    rows.value.findIndex((d) => d.id === id),
    1,
  );
  setRows();
}

function select(id: number) {
  selected.value = id;
}

function run() {
  setRows(buildData());
  selected.value = undefined;
}

function update() {
  const _rows = rows.value;
  for (let i = 0; i < _rows.length; i += 10) {
    _rows[i]!.label.value += ' !!!';
  }
}

function runLots() {
  setRows(buildData(10000));
  selected.value = undefined;
}

function clear() {
  setRows([]);
  selected.value = undefined;
}

function swapRows() {
  const _rows = rows.value;
  if (_rows.length > 998) {
    const d1 = _rows[1]!;
    _rows[1] = _rows[998]!;
    _rows[998] = d1;
    setRows();
  }
}
</script>

<template>
  <div class="container">
    <div class="jumbotron">
      <div class="row">
        <div class="col-md-6"><h1>Vue 3.5 (keyed)</h1></div>
        <div class="col-md-6">
          <div class="row">
            <div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="run" @click="run">Create 1,000 rows</button></div>
            <div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="runlots" @click="runLots">Create 10,000 rows</button></div>
            <div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="add" @click="add">Append 1,000 rows</button></div>
            <div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="update" @click="update">Update every 10th row</button></div>
            <div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="clear" @click="clear">Clear</button></div>
            <div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="swaprows" @click="swapRows">Swap Rows</button></div>
          </div>
        </div>
      </div>
    </div>
    <table class="table table-hover table-striped test-data">
      <tbody id="tbody">
        <tr v-for="row in rows" :key="row.id" :class="{ danger: row.id === selected }">
          <td class="col-md-1">{{ row.id }}</td>
          <td class="col-md-4"><a @click="select(row.id)">{{ row.label.value }}</a></td>
          <td class="col-md-1"><a @click="remove(row.id)"><span class="remove glyphicon glyphicon-remove" aria-hidden="true"></span></a></td>
          <td class="col-md-6"></td>
        </tr>
      </tbody>
    </table>
    <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span>
  </div>
</template>
