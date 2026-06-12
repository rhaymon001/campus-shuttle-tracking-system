<template>
  <div class="register-container">
    <h2>Student Registration</h2>
    <p class="subtitle">Create an account for the ABU Shuttle System</p>

    <div v-if="serverError" class="alert-banner danger-alert">
      <AlertTriangle :size="16" class="icon-spacing" />
      <span>{{ serverError }}</span>
    </div>
    <div v-if="successMessage" class="alert-banner success-alert">
      <CheckCircle2 :size="16" class="icon-spacing" />
      <span>{{ successMessage }}</span>
    </div>

    <form @submit="onSubmit" class="form-layout">
      <div class="form-group">
        <label for="name">Full Name</label>
        <div class="input-wrapper">
          <User :size="16" class="input-icon" />
          <input id="name" v-model="name" type="text" placeholder="e.g., John Doe" :class="{ 'input-error': errors.name }" />
        </div>
        <span class="error-msg">{{ errors.name }}</span>
      </div>

      <div class="form-group">
        <label for="email">ABU Student Email</label>
        <div class="input-wrapper">
          <Mail :size="16" class="input-icon" />
          <input id="email" v-model="email" type="email" placeholder="username@gmail.com" :class="{ 'input-error': errors.email }" />
        </div>
        <span class="error-msg">{{ errors.email }}</span>
      </div>

      <div class="form-group">
        <label for="studentId">Matric / Registration Number</label>
        <div class="input-wrapper">
          <Hash :size="16" class="input-icon" />
          <input id="studentId" v-model="studentId" type="text" placeholder="e.g., U12CS1001" :class="{ 'input-error': errors.studentId }" />
        </div>
        <span class="error-msg">{{ errors.studentId }}</span>
      </div>

      <div class="form-group">
        <label for="phone">Phone Number</label>
        <div class="input-wrapper">
          <Phone :size="16" class="input-icon" />
          <input id="phone" v-model="phone" type="tel" placeholder="e.g., 08012345678" :class="{ 'input-error': errors.phone }" />
        </div>
        <span class="error-msg">{{ errors.phone }}</span>
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <div class="input-wrapper">
          <Lock :size="16" class="input-icon" />
          <input id="password" v-model="password" type="password" placeholder="Minimum 6 characters" :class="{ 'input-error': errors.password }" />
        </div>
        <span class="error-msg">{{ errors.password }}</span>
      </div>

      <button type="submit" :disabled="isSubmitting" class="btn btn-primary">
        <Loader2 v-if="isSubmitting" :size="16" class="animate-spin icon-spacing" />
        <span>{{ isSubmitting ? 'Processing Registration...' : 'Register Account' }}</span>
      </button>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useForm, useField } from 'vee-validate';
import * as yup from 'yup';
import { User, Mail, Hash, Phone, Lock, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import router from '../router';

const authStore = useAuthStore();
const serverError = ref('');
const successMessage = ref('');

const validationSchema = yup.object({
  name: yup.string().required('Full name is required').min(3, 'Name must be at least 3 characters'),
  email: yup.string().required('Email address is required').email('Must be a valid email format'),
  studentId: yup.string().required('Matriculation number is required').matches(/^U\d{2}[A-Z]{2}\d{4}$/, 'Invalid format (e.g., U12CS1001)'),
  phone: yup.string().required('Phone number is required').matches(/^\d{11}$/, 'Phone number must be exactly 11 digits'),
  password: yup.string().required('Password is required').min(6, 'Password must be at least 6 characters long')
});

const { handleSubmit, errors, isSubmitting, resetForm } = useForm({ validationSchema });

const { value: name } = useField('name');
const { value: email } = useField('email');
const { value: studentId } = useField('studentId');
const { value: phone } = useField('phone');
const { value: password } = useField('password');

const onSubmit = handleSubmit(async (values) => {
  serverError.value = '';
  successMessage.value = '';
  try {
    const result = await authStore.registerStudent(values);
    successMessage.value = result.message || 'Registration successfully recorded!';
    resetForm();
    router.push("/login")
  } catch (err) {
    serverError.value = err || 'Connection dropped during submission.';
  }
});
</script>

<style scoped>
/* Scoped Styling matching Design Specifications Exactly */
.register-container {
  max-width: 450px;
  margin: 24px auto;
  padding: 16px;
  background: #FFFFFF;
  border: 0.5px solid rgba(0, 0, 0, 0.10);
  border-radius: 12px;
  color: #1A1A18;
}

h2 {
  font-size: 18px;
  font-weight: 500;
  margin: 0 0 4px 0;
  text-align: center;
}

.subtitle {
  font-size: 14px;
  color: #5F5E5A;
  margin: 0 0 16px 0;
  text-align: center;
}

.form-layout {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

label {
  font-size: 12px;
  font-weight: 500;
  color: #5F5E5A;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 12px;
  color: #5F5E5A;
}

input {
  width: 100%;
  height: 36px;
  padding: 0 12px 0 36px;
  box-sizing: border-box;
  background: #F4F3EF;
  border: 0.5px solid rgba(0, 0, 0, 0.10);
  border-radius: 6px;
  font-family: inherit;
  font-size: 14px;
  color: #1A1A18;
  transition: border-color 0.15s, box-shadow 0.15s;
}

input:focus {
  outline: none;
  border-color: #1D9E75;
  box-shadow: 0 0 0 2px #E1F5EE;
}

.input-error {
  border-color: #E24B4A !important;
  background-color: #FCEBEB;
}

.error-msg {
  font-size: 12px;
  color: #E24B4A;
  min-height: 16px;
}

/* Button UI Components mapping layout requirements */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  padding: 0 14px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: #1D9E75;
  color: #FFFFFF;
}

.icon-spacing {
  margin-right: 8px;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Alert Banner Designs with Side Borders */
.alert-banner {
  display: flex;
  align-items: center;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  margin-bottom: 12px;
  line-height: 1.4;
}

.danger-alert {
  background: #FCEBEB;
  color: #E24B4A;
  border-left: 4px solid #E24B4A;
}

.success-alert {
  background: #EAF3DE;
  color: #3B6D11;
  border-left: 4px solid #3B6D11;
}
</style>