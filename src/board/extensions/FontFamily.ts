// TipTap extension that adds per-character font family via the TextStyle mark.

import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        fontFamily: {
            setFontFamily: (family: string) => ReturnType
            unsetFontFamily: () => ReturnType
        }
    }
}

export const FontFamily = Extension.create({
    name: 'fontFamily',

    addGlobalAttributes() {
        return [
            {
                types: ['textStyle'],
                attributes: {
                    fontFamily: {
                        default: null,
                        parseHTML: (el) => el.style.fontFamily || null,
                        renderHTML: (attrs) => {
                            if (!attrs.fontFamily) return {}
                            return { style: `font-family: ${attrs.fontFamily}` }
                        },
                    },
                },
            },
        ]
    },

    addCommands() {
        return {
            setFontFamily:
                (family) =>
                ({ commands }) =>
                    commands.setMark('textStyle', { fontFamily: family }),
            unsetFontFamily:
                () =>
                ({ commands }) =>
                    commands.setMark('textStyle', { fontFamily: null }),
        }
    },
})
