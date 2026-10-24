import { parseMarkdown } from './src/markdown.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('Running markdown parser unit tests...');

// 1. Test YAML Frontmatter / Properties
const sampleWithProps = `---
title: Research Notes
date: 2026-10-23
tags: [ai, pkm, graph]
---

# Title of Note
Content here.`;

const resultProps = parseMarkdown(sampleWithProps, new Set(['research notes']));
assert(resultProps.properties.length === 3, 'Should parse 3 properties');
assert(resultProps.properties[0]?.key === 'title', 'Property 0 key should be title');
assert(resultProps.properties[1]?.key === 'date', 'Property 1 key should be date');
assert(resultProps.properties[2]?.key === 'tags', 'Property 2 key should be tags');
assert(resultProps.html.includes('class="properties-table"'), 'HTML should contain properties-table');
assert(resultProps.html.includes('class="tag-pill"'), 'HTML should contain tag pills');
console.log('✓ YAML Frontmatter / Properties test passed');

// 2. Test Callouts (Obsidian styles)
const sampleCallout = `> [!NOTE] Knowledge Base
> This is a note callout.

> [!WARNING] Danger Ahead
> Be careful here!`;

const resultCallout = parseMarkdown(sampleCallout);
assert(resultCallout.html.includes('callout-note'), 'HTML should contain callout-note');
assert(resultCallout.html.includes('callout-warning'), 'HTML should contain callout-warning');
assert(resultCallout.html.includes('callout-title'), 'HTML should contain callout-title');
console.log('✓ Callouts test passed');

// 3. Test WikiLinks and Aliases
const sampleLinks = `See [[Welcome Note]] and [[Deep Dive|In-Depth Guide]] or [[NonExistent]].`;
const knownNotes = new Set(['welcome note', 'deep dive']);
const resultLinks = parseMarkdown(sampleLinks, knownNotes);
assert(resultLinks.wikiLinks.includes('Welcome Note'), 'Should extract Welcome Note');
assert(resultLinks.wikiLinks.includes('Deep Dive'), 'Should extract Deep Dive');
assert(resultLinks.html.includes('data-target="Welcome Note"'), 'Should render target attribute');
assert(resultLinks.html.includes('In-Depth Guide'), 'Should render alias text');
assert(resultLinks.html.includes('unresolved'), 'Should mark missing note as unresolved');
console.log('✓ WikiLinks and Aliases test passed');

// 4. Test Checklists
const sampleTasks = `- [ ] Open task
- [x] Completed task`;

const resultTasks = parseMarkdown(sampleTasks);
assert(resultTasks.html.includes('type="checkbox"'), 'Should render checkboxes');
assert(resultTasks.html.includes('checked'), 'Should have checked attribute for completed task');
assert(resultTasks.html.includes('task-checkbox'), 'Should have task-checkbox class');
console.log('✓ Checklists test passed');

// 5. Test Code Blocks & Tables
const sampleCodeAndTable = `\`\`\`go
func main() {
    println("hello")
}
\`\`\`

| Key | Value |
| --- | --- |
| A   | 100 |`;

const resultCodeTable = parseMarkdown(sampleCodeAndTable);
assert(resultCodeTable.html.includes('<pre>'), 'Should render code block pre');
assert(resultCodeTable.html.includes('code-copy-btn'), 'Should render code copy button');
assert(resultCodeTable.html.includes('<table>'), 'Should render table');
assert(resultCodeTable.html.includes('<th>Key</th>'), 'Should render table header');
console.log('✓ Code blocks and Tables test passed');

// 6. Test Headings and Table of Contents outline extraction
const sampleHeadings = `# Section 1
## Sub-Section 1.1
### Deep Topic 1.1.1`;

const resultHeadings = parseMarkdown(sampleHeadings);
assert(resultHeadings.headings.length === 3, 'Should extract 3 headings');
assert(resultHeadings.headings[0]?.level === 1, 'First heading should be level 1');
assert(resultHeadings.headings[1]?.level === 2, 'Second heading should be level 2');
assert(resultHeadings.headings[2]?.level === 3, 'Third heading should be level 3');
assert(resultHeadings.html.includes('id="section-1"'), 'Should generate anchor ID for H1');
console.log('✓ Headings and Outline extraction test passed');

// 7. Test Pele SVG Diagram Rendering (Mermaid/Pele syntax)
const samplePeleDiagram = `\`\`\`pele
flowchart LR
    A[Start] --> B[Gosidian]
    B --> C[Success]
\`\`\``;

const resultPele = parseMarkdown(samplePeleDiagram);
assert(resultPele.html.includes('pele-diagram-container'), 'Should wrap pele diagram in container');
assert(resultPele.html.includes('<svg'), 'Pele should generate raw SVG element');
console.log('✓ Pele SVG Diagram rendering test passed');

// 8. Test KaTeX LaTeX Math Equations
const sampleMath = `Energy formula is $E = mc^2$.

$$
\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$`;

const resultMath = parseMarkdown(sampleMath);
assert(resultMath.html.includes('katex'), 'Should render KaTeX math elements');
assert(resultMath.html.includes('math-block'), 'Should render block math container');
console.log('✓ KaTeX LaTeX Mathematics test passed');

// 9. Test Footnotes
const sampleFootnotes = `Here is a statement with a footnote.[^1]

[^1]: This is the verified source reference.`;

const resultFootnotes = parseMarkdown(sampleFootnotes);
assert(resultFootnotes.html.includes('footnote-ref'), 'Should render footnote reference anchor');
assert(resultFootnotes.html.includes('footnotes-section'), 'Should render footnotes section at bottom');
console.log('✓ Footnotes test passed');

// 10. Test Image Rendering
const sampleImageMd = "![Banner](/assets/banner.jpg)\n\n![[banner.jpg]]";
const resultImage = parseMarkdown(sampleImageMd);
assert(resultImage.html.includes('src="/assets/banner.jpg"'), "Should render markdown image src");
assert(resultImage.html.includes('class="md-image"'), "Should include md-image class");
console.log('✓ Image Rendering test passed');

console.log('\nAll 10 Markdown Parser unit tests passed successfully!');
