// Parses TipTap/HTML content into typed paragraph and styled run structures
// for Canvas 2D rendering. No DOM injection — uses a detached container element.

export interface TextRun {
    text: string
    fontFamily: string
    fontSize: number
    fontWeight: string
    fontStyle: string
    color: string
    underline: boolean
    strikethrough: boolean
}

export interface StyledParagraph {
    runs: TextRun[]
    textAlign: 'left' | 'center' | 'right' | 'justify'
    blockFontSize: number
    // Bottom spacing after this paragraph (pixels)
    marginBottom: number
    // Left indent for list items (pixels)
    indent: number
    // Prefix string rendered before the first line (e.g. "•" or "1.")
    bullet: string
}

type InheritedStyle = Omit<TextRun, 'text'>

export function parseHtmlText(
    html: string,
    base: { fontFamily: string; fontSize: number; color: string; textAlign: string }
): StyledParagraph[] {
    const container = document.createElement('div')
    container.innerHTML = html

    const baseStyle: InheritedStyle = {
        fontFamily: base.fontFamily || 'sans-serif',
        fontSize: base.fontSize,
        fontWeight: 'normal',
        fontStyle: 'normal',
        color: base.color || '#000000',
        underline: false,
        strikethrough: false,
    }

    const paragraphs: StyledParagraph[] = []

    function processBlock(el: Element, listCtx: { type: 'ul' | 'ol' | null; idx: number }) {
        const tag = el.tagName.toLowerCase()

        if (tag === 'ul' || tag === 'ol') {
            let idx = 1
            for (const child of el.children)
                processBlock(child, { type: tag as 'ul' | 'ol', idx: idx++ })
            return
        }

        let fontMult = 1
        let blockWeight = baseStyle.fontWeight
        let marginBottom = base.fontSize * 0.5
        let indent = 0
        let bullet = ''

        if (tag === 'h1') {
            fontMult = 1.5
            blockWeight = '600'
            marginBottom = base.fontSize * 0.6
        } else if (tag === 'h2') {
            fontMult = 1.25
            blockWeight = '600'
            marginBottom = base.fontSize * 0.5
        } else if (tag === 'h3') {
            fontMult = 1.1
            blockWeight = '600'
            marginBottom = base.fontSize * 0.44
        } else if (tag === 'li') {
            indent = base.fontSize * 1.25
            marginBottom = base.fontSize * 0.2
            bullet = listCtx.type === 'ol' ? `${listCtx.idx}.` : '•'
        }

        const blockFontSize = base.fontSize * fontMult
        const inherited: InheritedStyle = {
            ...baseStyle,
            fontSize: blockFontSize,
            fontWeight: blockWeight,
        }

        const elStyle = el.getAttribute('style') ?? ''
        const alignMatch = elStyle.match(/text-align:\s*(\w+)/)
        const textAlign = (alignMatch?.[1] ?? base.textAlign) as StyledParagraph['textAlign']

        const runs: TextRun[] = []
        collectRuns(el, inherited, runs)

        paragraphs.push({ runs, textAlign, blockFontSize, marginBottom, indent, bullet })
    }

    for (const node of container.childNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            processBlock(node as Element, { type: null, idx: 1 })
        } else if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim() ?? ''
            if (text) {
                paragraphs.push({
                    runs: [{ ...baseStyle, text }],
                    textAlign: base.textAlign as StyledParagraph['textAlign'],
                    blockFontSize: base.fontSize,
                    marginBottom: 0,
                    indent: 0,
                    bullet: '',
                })
            }
        }
    }

    return paragraphs
}

function collectRuns(el: Element, inherited: InheritedStyle, result: TextRun[]) {
    for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent ?? ''
            if (text) result.push({ ...inherited, text })
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const child = node as Element
            const tag = child.tagName.toLowerCase()
            const style = child.getAttribute('style') ?? ''
            const next: InheritedStyle = { ...inherited }

            if (tag === 'strong' || tag === 'b') next.fontWeight = '600'
            if (tag === 'em' || tag === 'i') next.fontStyle = 'italic'
            if (tag === 'u') next.underline = true
            if (tag === 's' || tag === 'del' || tag === 'strike') next.strikethrough = true
            if (tag === 'code') {
                next.fontFamily = 'monospace'
                next.fontSize = next.fontSize * 0.9
            }
            if (tag === 'br') {
                result.push({ ...inherited, text: '\n' })
                continue
            }

            const colorMatch = style.match(/(?:^|;)\s*color:\s*([^;]+)/)
            if (colorMatch) next.color = colorMatch[1].trim()

            const sizeMatch = style.match(/font-size:\s*([\d.]+)px/)
            if (sizeMatch) next.fontSize = parseFloat(sizeMatch[1])

            const familyMatch = style.match(/font-family:\s*([^;]+)/)
            if (familyMatch) next.fontFamily = familyMatch[1].trim().replace(/^['"]|['"]$/g, '')

            const weightMatch = style.match(/font-weight:\s*([^;]+)/)
            if (weightMatch) next.fontWeight = weightMatch[1].trim()

            collectRuns(child, next, result)
        }
    }
}
