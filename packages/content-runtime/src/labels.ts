const english={
  sourceNote:'Source note:',learn:'Learn',scripture:'Scripture & Biblical Principle',prayer:'Prayer & Surrender',practice:'Putting it into practice',discuss:'Reflect & discuss',ideas:'Key ideas',
  guided:'Guided',selfPaced:'Self Paced',module:'Module',page:'Page',section:'Section',
  nextSection:'Next section',nextPage:'Next page',previousSection:'Previous section',previousPage:'Previous page',
  reflect:'Reflect',complete:'Complete',pause:'Ⅱ Pause',resume:'▶ Resume',replay:'↻ Replay',retry:'↻ Retry',narrate:'▶ Narrate',
  options:'Lesson options',readSections:'Read section by section',showAll:'Show entire page',openReflection:'Open reflection',
  groupQuestions:'Group questions',on:'On',off:'Off',browserVoice:'Browser voice',recording:'Marin · AI narration',humanRecording:'Recorded narration',
  useBrowser:'Use browser voice',useRecording:'Use recording',present:'Present',exit:'Exit presentation',
  navigation:'Lesson navigation',noRecording:'No recording',facilitator:'FACILITATOR PAUSE',pauseReflect:'PAUSE & REFLECT',
  returnPage:'Return to page',continueNext:'Next page →',closeReflection:'Close reflection'
};
const spanish:typeof english={
  sourceNote:'Nota de la fuente:',learn:'Aprender',scripture:'Escritura y principio bíblico',prayer:'Oración y entrega',practice:'Poner en práctica',discuss:'Reflexionar y conversar',ideas:'Ideas clave',
  guided:'Guiado',selfPaced:'A tu ritmo',module:'Módulo',page:'Página',section:'Sección',
  nextSection:'Siguiente sección',nextPage:'Siguiente página',previousSection:'Sección anterior',previousPage:'Página anterior',
  reflect:'Reflexionar',complete:'Completado',pause:'Ⅱ Pausar',resume:'▶ Continuar',replay:'↻ Repetir',retry:'↻ Reintentar',narrate:'▶ Narrar',
  options:'Opciones de la lección',readSections:'Leer por secciones',showAll:'Mostrar toda la página',openReflection:'Abrir reflexión',
  groupQuestions:'Preguntas para el grupo',on:'Sí',off:'No',browserVoice:'Voz del navegador',recording:'Marin · Narración con IA',humanRecording:'Narración grabada',
  useBrowser:'Usar voz del navegador',useRecording:'Usar grabación',present:'Presentar',exit:'Salir de presentación',
  navigation:'Navegación de la lección',noRecording:'Sin grabación',facilitator:'PAUSA PARA EL FACILITADOR',pauseReflect:'PAUSA Y REFLEXIONA',
  returnPage:'Volver a la página',continueNext:'Siguiente página →',closeReflection:'Cerrar reflexión'
};
export const labels=(language:string)=>language.startsWith('es')?spanish:english;
