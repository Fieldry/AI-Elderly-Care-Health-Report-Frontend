<script setup lang="ts">
import { useCounterStore } from '@/stores/counter'
import { storeToRefs } from 'pinia'

const counterStore = useCounterStore()
const { count, doubleCount } = storeToRefs(counterStore)
</script>

<template>
  <div class="about">
    <h1>About This Project</h1>
    <p>This is an example of using Pinia for state management.</p>

    <div class="counter-demo">
      <h2>Counter Demo</h2>
      <div class="counter-display">
        <p>Count: {{ count }}</p>
        <p>Double Count: {{ doubleCount }}</p>
      </div>
      <button @click="counterStore.increment">Increment</button>
    </div>
  </div>
</template>

<style scoped>
.about {
  padding: 2rem 0;
}

h1 {
  font-size: 2.5rem;
  margin-bottom: 1rem;
  color: #213547;
}

.counter-demo {
  margin-top: 2rem;
  padding: 2rem;
  border: 1px solid #e2e2e2;
  border-radius: 8px;
}

.counter-demo h2 {
  margin-bottom: 1rem;
  color: #42b883;
}

.counter-display {
  margin: 1rem 0;
}

.counter-display p {
  font-size: 1.2rem;
  margin: 0.5rem 0;
}

button {
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  background-color: #42b883;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s ease;
}

button:hover {
  background-color: #33a06f;
}
</style>
