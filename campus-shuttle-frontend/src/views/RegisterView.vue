<template>
  <div class="auth-page">
    <RegisterForm />
    <p class="auth-navigation">
      Already have an account? 
      <router-link to="/login">Login here</router-link>
    </p>
  </div>
</template>

<script setup>
import RegisterForm from '../components/RegisterForm.vue';
</script>

<style scoped>
.auth-page {
  padding-top: 20px;
}
.auth-navigation {
  text-align: center;
  font-size: 14px;
  margin-top: 15px;
}
.auth-navigation a {
  color: #3498db;
  text-decoration: none;
  font-weight: 600;
}
.auth-navigation a:hover {
  text-decoration: underline;
}
</style>