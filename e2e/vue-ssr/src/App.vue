<script setup lang="ts">
import { DiscordPreview } from '@kyzegs/discord-preview/vue';
import type { PreviewProps } from '@kyzegs/discord-preview/vue';
import { ref } from 'vue';
import { replyFor } from '../../shared/protocol.ts';

const props = defineProps<{ initial: PreviewProps }>();
const state = ref(props.initial);
defineExpose({ set: (p: Partial<PreviewProps>) => void (state.value = { ...state.value, ...p }) });
</script>

<template>
  <DiscordPreview
    v-bind="state"
    selectable
    @press="(d) => d.reply(replyFor(d.component))"
    @selectblock="(path) => (state = { ...state, selected: path })"
  />
</template>
