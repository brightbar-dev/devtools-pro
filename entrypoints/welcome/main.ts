import { TOOLS } from '@/utils/tools';
import { toolIcon } from '@/utils/icons';
import { escapeHtml } from '@/utils/dom';

const list = document.getElementById('tools')!;
list.innerHTML = TOOLS.map(tool => `<li class="tool">
  <span class="tool-icon">${toolIcon(tool.id)}</span>
  <span class="tool-text"><strong>${escapeHtml(tool.name)}</strong><span>${escapeHtml(tool.description)}</span></span>
</li>`).join('');
