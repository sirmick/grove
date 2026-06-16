<script lang="ts">
  // Thin wrapper over @lucide/svelte so callers keep using <Icon name="folder-tree" />.
  // Named imports tree-shake, so only the icons we actually use are bundled.
  import {
    Box,
    Camera,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    ChevronsUpDown,
    CircleHelp,
    FileClock,
    FileText,
    Folder,
    FolderOpen,
    Link,
    PanelBottom,
    PanelLeft,
    Pencil,
    Plus,
    Save,
    ScrollText,
    Search,
    Table2,
  } from '@lucide/svelte'
  import type { Component } from 'svelte'

  let { name, size = 16 }: { name: string; size?: number } = $props()

  const map: Record<string, Component<{ size?: number }>> = {
    box: Box,
    camera: Camera,
    check: Check,
    'chevron-down': ChevronDown,
    'chevron-left': ChevronLeft,
    'chevron-right': ChevronRight,
    'chevron-up': ChevronUp,
    'chevrons-up-down': ChevronsUpDown,
    'help-circle': CircleHelp,
    'file-clock': FileClock,
    'file-text': FileText,
    folder: Folder,
    'folder-open': FolderOpen,
    link: Link,
    'panel-bottom': PanelBottom,
    'panel-left': PanelLeft,
    pencil: Pencil,
    plus: Plus,
    save: Save,
    'scroll-text': ScrollText,
    search: Search,
    'table-2': Table2,
  }

  const Cmp = $derived(map[name])
</script>

{#if Cmp}<Cmp {size} />{/if}
