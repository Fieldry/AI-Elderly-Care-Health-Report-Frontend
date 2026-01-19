<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="home">
    <h1>Welcome to AI Elderly Care Health Report</h1>
    <p>This is a Vue 3 application with TypeScript, Router, and Pinia.</p>

    <div class="features">
      <div class="feature">
        <h2>Vue 3</h2>
        <p>Build with Vue 3 Composition API</p>
      </div>

      <div class="feature">
        <h2>TypeScript</h2>
        <p>Full TypeScript support</p>
      </div>

      <div class="feature">
        <h2>Vite</h2>
        <p>Next Generation Frontend Tooling</p>
      </div>

      <div class="feature">
        <h2>Pinia</h2>
        <p>State Management</p>
      </div>

      <div class="feature">
        <h2>Vue Router</h2>
        <p>Official Router for Vue.js</p>
      </div>
    </div>

    <RouterLink to="/about">Learn more about this project</RouterLink>
  </div>
</template>

<style scoped>
.home {
  padding: 2rem 0;
}

h1 {
  font-size: 2.5rem;
  margin-bottom: 1rem;
  color: #213547;
}

.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  margin: 2rem 0;
}

.feature {
  padding: 1.5rem;
  border: 1px solid #e2e2e2;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.feature:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.feature h2 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  color: #42b883;
}

.feature p {
  color: #666;
}

a {
  color: #42b883;
  text-decoration: none;
  font-weight: 600;
}

a:hover {
  text-decoration: underline;
}
</style>
