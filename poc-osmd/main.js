const log = (msg) => {
    const el = document.getElementById("log");
    el.innerHTML += `<div>> ${msg}</div>`;
    el.scrollTop = el.scrollHeight;
    console.log(msg);
  };
  
  const MUSICXML = `<?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN"
    "http://www.musicxml.org/dtds/partwise.dtd">
  <score-partwise version="3.1">
    <part-list>
      <score-part id="P1"><part-name>Piano</part-name></score-part>
    </part-list>
    <part id="P1">
      <measure number="1">
        <attributes>
          <divisions>1</divisions>
          <key><fifths>0</fifths></key>
          <time><beats>4</beats><beat-type>4</beat-type></time>
          <clef><sign>G</sign><line>2</line></clef>
        </attributes>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
        <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
        <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
        <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      </measure>
    </part>
  </score-partwise>`;
  
  // OSMD est disponible en global via window.opensheetmusicdisplay
  const { OpenSheetMusicDisplay } = window.opensheetmusicdisplay;
  
  let graphicalNotes = [];
  const osmd = new OpenSheetMusicDisplay("osmd-container", {
    autoResize: true,
    drawTitle: false,
    drawCredits: false,
  });
  
  async function init() {
    log("Chargement OSMD...");
    try {
      await osmd.load(MUSICXML);
      await osmd.render();
      log("✅ OSMD rendu OK");
      collectGraphicalNotes();
    } catch (e) {
      log("❌ Erreur OSMD : " + e.message);
      console.error(e);
    }
  }
  
  function collectGraphicalNotes() {
    graphicalNotes = [];
  
    const measureList = osmd.GraphicSheet?.MeasureList;
    if (!measureList) {
      log("❌ GraphicSheet.MeasureList introuvable");
      return;
    }
  
    for (const staffMeasures of measureList) {
      for (const measure of staffMeasures) {
        if (!measure) continue;
        for (const staffEntry of measure.staffEntries ?? []) {
          for (const gve of staffEntry.graphicalVoiceEntries ?? []) {
            for (const gn of gve.notes ?? []) {
              graphicalNotes.push(gn);
            }
          }
        }
      }
    }
  
    log(`📋 ${graphicalNotes.length} GraphicalNote(s) collectée(s)`);
  }
  
  function colorNote(graphicalNote, color) {
    const svgG = graphicalNote.getSVGGElement?.();
    if (svgG) {
      svgG.querySelectorAll("path, ellipse, use").forEach(el => {
        el.setAttribute("fill", color);
        el.setAttribute("stroke", color);
      });
      log(`🎨 Colorié via getSVGGElement → ${color}`);
      return;
    }
    log(`⚠️ getSVGGElement non disponible pour cette note`);
  }
  
  function resetAllNotes() {
    graphicalNotes.forEach(gn => colorNote(gn, "black"));
    log("⬜ Reset → toutes les notes en noir");
  }
  
  document.getElementById("btn-green").onclick = () => {
    if (graphicalNotes[0]) colorNote(graphicalNotes[0], "#22c55e");
    else log("⚠️ Aucune note collectée");
  };
  
  document.getElementById("btn-red").onclick = () => {
    if (graphicalNotes[1]) colorNote(graphicalNotes[1], "#ef4444");
    else log("⚠️ Aucune note collectée");
  };
  
  document.getElementById("btn-reset").onclick = resetAllNotes;
  
  document.getElementById("btn-dump").onclick = () => {
    graphicalNotes.forEach((gn, i) => {
      console.log(`Note ${i}:`, gn);
      log(`Note ${i} — pitch: ${gn.sourceNote?.pitch?.toString() ?? "?"}`);
    });
  };
  
  init();
  