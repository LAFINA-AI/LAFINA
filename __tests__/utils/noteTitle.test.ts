import {deriveNoteTitle,displayNoteTitle,UNTITLED_NOTE_TITLE} from '../../src/utils';

describe('note titles from the first line',()=>{
  it('uses the first line of plain text and skips blank lines',()=>{
    expect(deriveNoteTitle('\n\n  Thesis defense prep  \nSecond line')).toBe('Thesis defense prep');
  });
  it('strips Markdown formatting and list markers',()=>{
    expect(deriveNoteTitle('# **Biology** review\nMore')).toBe('Biology review');
    expect(deriveNoteTitle('- [ ] Buy *lab* gown\n- [x] Print form')).toBe('Buy lab gown');
    expect(deriveNoteTitle('1. Call the registrar')).toBe('Call the registrar');
  });
  it('reads desktop HTML bodies as text',()=>{
    expect(deriveNoteTitle('<h1>Meeting <b>notes</b></h1><p>Agenda</p>')).toBe('Meeting notes');
  });
  it('falls back when a body has no words',()=>{
    expect(deriveNoteTitle('')).toBe(UNTITLED_NOTE_TITLE);
    expect(deriveNoteTitle(null)).toBe(UNTITLED_NOTE_TITLE);
    expect(deriveNoteTitle('   \n ')).toBe(UNTITLED_NOTE_TITLE);
    expect(deriveNoteTitle('---\n***')).toBe(UNTITLED_NOTE_TITLE);
    expect(deriveNoteTitle('[image: photo]','Quick Note')).toBe('Quick Note');
  });
  it('caps long lines at a word boundary',()=>{
    const title=deriveNoteTitle('Review the seventh chapter of the operating systems textbook before the long quiz');
    expect(title).toBe('Review the seventh chapter of the operating systems…');
  });
  it('cuts one very long word rather than returning nothing',()=>{
    expect(deriveNoteTitle('x'.repeat(100))).toBe(`${'x'.repeat(60)}…`);
  });
  it('replaces only placeholders at display time, never a chosen title',()=>{
    expect(displayNoteTitle('Untitled Note','Lab results')).toBe('Lab results');
    expect(displayNoteTitle('Quick Note','Lab results')).toBe('Lab results');
    expect(displayNoteTitle('  ','Lab results')).toBe('Lab results');
    expect(displayNoteTitle('Quick Note','')).toBe('Quick Note');
    expect(displayNoteTitle('My title','Lab results')).toBe('My title');
  });
});
