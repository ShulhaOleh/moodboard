// TipTap extension that adds per-character font size via the TextStyle mark.

import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        fontSize: {
            setFontSize: (size: string) => ReturnType
            unsetFontSize: () => ReturnType
        }
    }
}

export const FontSize = Extension.create({
    name: 'fontSize',

    addGlobalAttributes() {
        return [
            {
                types: ['textStyle'],
                attributes: {
                    fontSize: {
                        default: null,
                        parseHTML: (el) => el.style.fontSize || null,
                        renderHTML: (attrs) => {
                            if (!attrs.fontSize) return {}
                            return { style: `font-size: ${attrs.fontSize}` }
                        },
                    },
                },
            },
        ]
    },

    addCommands() {
        return {
            setFontSize:
                (size) =>
                ({ commands }) =>
                    commands.setMark('textStyle', { fontSize: size }),
            unsetFontSize:
                () =>
                ({ commands }) =>
                    commands.setMark('textStyle', { fontSize: null }),
        }
    },
})
