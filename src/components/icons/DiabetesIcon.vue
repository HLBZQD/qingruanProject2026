<script setup lang="ts">
const props = withDefaults(defineProps<{
  name: string
  size?: number | string
  color?: string
}>(), {
  size: 24,
  color: 'currentColor',
})

const classMap: Record<string, string> = {
  medical: 'diabetes-icon-medical',
  medical2: 'diabetes-icon-medical2',
  'diabetes-manage': 'diabetes-icon-diabetes-manage',
  diabetes: 'diabetes-icon-diabetes',
  'diabetes-type': 'diabetes-icon-diabetes-type',
  'diabetes-screening': 'diabetes-icon-diabetes-screening',
  'medical-service': 'diabetes-icon-medical-service',
  'medical-institution': 'diabetes-icon-medical-institution',
  'medical-screen': 'diabetes-icon-medical-screen',
  'medical-screen2': 'diabetes-icon-medical-screen2',
  'medical-doc': 'diabetes-icon-medical-doc',
  'medical-doc2': 'diabetes-icon-medical-doc2',
  report: 'diabetes-icon-report',
  nurse: 'diabetes-icon-nurse',
  plaster: 'diabetes-icon-plaster',
  plaster2: 'diabetes-icon-plaster2',
  'pulse-histogram': 'diabetes-icon-pulse-histogram',
  ribbon: 'diabetes-icon-ribbon',
  stethoscope: 'diabetes-icon-stethoscope',
  pills: 'diabetes-icon-pills',
  cross: 'diabetes-icon-cross',
  cross2: 'diabetes-icon-cross2',
  cross3: 'diabetes-icon-cross3',
  ambulance: 'diabetes-icon-ambulance',
  'blood-drop': 'diabetes-icon-blood-drop',
  'blood-drop2': 'diabetes-icon-blood-drop2',
  'blood-drop3': 'diabetes-icon-blood-drop3',
  pulse: 'diabetes-icon-pulse',
  'patient-wheelchair': 'diabetes-icon-patient-wheelchair',
  'doctor-bag': 'diabetes-icon-doctor-bag',
  'nurse-hat': 'diabetes-icon-nurse-hat',
  drug: 'diabetes-icon-drug',
  temperature: 'diabetes-icon-temperature',
  'doctor-notes': 'diabetes-icon-doctor-notes',
  syringe: 'diabetes-icon-syringe',
  'diagnose-heart': 'diabetes-icon-diagnose-heart',
  heart: 'diabetes-icon-heart',
  pill: 'diabetes-icon-pill',
  'heart-cross': 'diabetes-icon-heart-cross',
  'hospital-point': 'diabetes-icon-hospital-point',
  'medical-note': 'diabetes-icon-medical-note',
  'home-care': 'diabetes-icon-home-care',
  'helicopter-passageway': 'diabetes-icon-helicopter-passageway',
  'hospital-bed': 'diabetes-icon-hospital-bed',
  'hospital-bed2': 'diabetes-icon-hospital-bed2',
  gauze: 'diabetes-icon-gauze',
  'medicine-drug': 'diabetes-icon-medicine-drug',
  'medical-sign': 'diabetes-icon-medical-sign',
}

const iconClass = classMap[props.name] || 'diabetes-icon-medical'
const sizeValue = typeof props.size === 'number' ? `${props.size}px` : props.size
</script>

<template>
  <span
    class="diabetes-iconfont diabetes-icon"
    :class="iconClass"
    :style="{ fontSize: sizeValue, width: sizeValue, height: sizeValue, color }"
    aria-hidden="true"
  ></span>
</template>

<style scoped>
.diabetes-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  flex-shrink: 0;
  vertical-align: middle;
}
</style>
