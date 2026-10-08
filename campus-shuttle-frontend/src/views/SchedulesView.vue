<template>
  <div class="page-container">
    <div class="panel-header-label">DAILY RUNNING SCHEDULES</div>
    
    <div v-if="loading" class="loading-state">Loading timetables...</div>
    
    <div v-else class="schedules-grid">
      <div v-for="sched in schedules" :key="sched._id" class="schedule-card">
        <div class="schedule-header">
          <span class="route-tag">{{ sched.routeId?.name || 'Unknown route' }}</span>
          <span class="status-indicator" :class="{ 'active-run': sched.isActive }">
            {{ sched.isActive ? 'Operational' : 'Suspended' }}
          </span>
        </div>
        
        <div class="schedule-body">
          <div class="time-block">
            <span class="time-label">OPERATIONAL WINDOW</span>
            <p class="time-value">{{ sched.startTime }} — {{ sched.endTime }}</p>
          </div>
          
          <div class="frequency-row">
            <span class="muted">Dispatch Frequency:</span>
            <span class="freq-value">Every {{ sched.estimatedFrequencyMinutes }} mins</span>
          </div>
          
          <div class="days-pills">
            <span 
              v-for="day in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']" 
              :key="day"
              class="day-dot"
              :class="{ 'day-active': sched.recurringDays.includes(day) }"
            >
              {{ day }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import apiClient from '../api/axios';

const schedules = ref([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const res = await apiClient.get('/transit/schedules');
    schedules.value = res.data;
  } catch (err) {
    console.error('Error loading schedules:', err);
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.page-container { padding: 4px 0; }
.panel-header-label {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  color: #5F5E5A;
  padding-bottom: 6px;
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.1);
  margin-bottom: 16px;
}
.loading-state { font-size: 13px; color: #5F5E5A; text-align: center; padding: 40px 0; }
.schedules-grid { display: flex; flex-direction: column; gap: 12px; }
.schedule-card {
  background: #FFFFFF;
  border: 0.5px solid rgba(0, 0, 0, 0.10);
  border-radius: 12px;
  padding: 16px;
}
.schedule-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.route-tag { font-size: 13px; font-weight: 500; color: #0D2137; }
.status-indicator { font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 999px; background: #F4F3EF; color: #5F5E5A; }
.status-indicator.active-run { background: #E1F5EE; color: #0F6E56; }
.schedule-body { display: flex; flex-direction: column; gap: 12px; }
.time-block { background: #F4F3EF; padding: 10px 12px; border-radius: 8px; border-left: 3px solid #1D9E75; }
.time-label { font-size: 10px; font-weight: 500; color: #5F5E5A; display: block; letter-spacing: 0.05em; }
.time-value { font-size: 15px; font-weight: 600; color: #1A1A18; margin: 4px 0 0 0; font-family: monospace; }
.frequency-row { display: flex; justify-content: space-between; font-size: 13px; }
.muted { color: #5F5E5A; }
.freq-value { font-weight: 500; color: #1A1A18; }
.days-pills { display: flex; gap: 4px; margin-top: 4px; }
.day-dot { font-size: 11px; padding: 2px 6px; border-radius: 4px; background: #F4F3EF; color: rgba(0,0,0,0.25); }
.day-dot.day-active { background: #0D2137; color: #FFFFFF; }
</style>