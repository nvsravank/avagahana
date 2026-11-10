<!-- Avagahana map: change it with the illuminate-concept skill -->
# Flowchart shapes

Every shape in Mermaid's flowchart list, grouped by what it usually means. Each is
written as `id@{ shape: <name>, label: "…" }`; the name under each label is its short
name. The fourteen classic shapes also have a bracket form, such as `{"…"}` for a
decision. Shapes Mermaid draws with no label (small circles, the fork bar, the bolt)
each sit in a small box named for them.

```mermaid
flowchart TB
  subgraph steps [Steps]
    rect@{ shape: rect, label: "Process<br>rect" }
    rounded@{ shape: rounded, label: "Event<br>rounded" }
    stadium@{ shape: stadium, label: "Terminal point<br>stadium" }
    frrect@{ shape: fr-rect, label: "Subprocess<br>fr-rect" }
    linrect@{ shape: lin-rect, label: "Lined process<br>lin-rect" }
    divrect@{ shape: div-rect, label: "Divided process<br>div-rect" }
    strect@{ shape: st-rect, label: "Multi-process<br>st-rect" }
    tagrect@{ shape: tag-rect, label: "Tagged process<br>tag-rect" }
    notchrect@{ shape: notch-rect, label: "Card<br>notch-rect" }
    notchpent@{ shape: notch-pent, label: "Loop limit<br>notch-pent" }
    odd@{ shape: odd, label: "Odd<br>odd" }
    delay@{ shape: delay, label: "Delay<br>delay" }
    curvtrap@{ shape: curv-trap, label: "Display<br>curv-trap" }
  end

  subgraph choices [Decisions, input and output]
    diam@{ shape: diam, label: "Decision<br>diam" }
    hex@{ shape: hex, label: "Prepare<br>hex" }
    leanr@{ shape: lean-r, label: "Data in or out<br>lean-r" }
    leanl@{ shape: lean-l, label: "Data out or in<br>lean-l" }
    trapb@{ shape: trap-b, label: "Priority action<br>trap-b" }
    trapt@{ shape: trap-t, label: "Manual operation<br>trap-t" }
    slrect@{ shape: sl-rect, label: "Manual input<br>sl-rect" }
    tri@{ shape: tri, label: "Extract<br>tri" }
    fliptri@{ shape: flip-tri, label: "Manual file<br>flip-tri" }
    hourglass@{ shape: hourglass, label: "Collate<br>hourglass" }
  end

  subgraph documents [Documents]
    doc@{ shape: doc, label: "Document<br>doc" }
    lindoc@{ shape: lin-doc, label: "Lined document<br>lin-doc" }
    tagdoc@{ shape: tag-doc, label: "Tagged document<br>tag-doc" }
    docs@{ shape: docs, label: "Multi-document<br>docs" }
    flag@{ shape: flag, label: "Paper tape<br>flag" }
    folder@{ shape: folder, label: "Folder<br>folder" }
  end

  subgraph storage [Storage]
    cyl@{ shape: cyl, label: "Database<br>cyl" }
    lincyl@{ shape: lin-cyl, label: "Disk storage<br>lin-cyl" }
    hcyl@{ shape: h-cyl, label: "Direct access storage<br>h-cyl" }
    bowrect@{ shape: bow-rect, label: "Stored data<br>bow-rect" }
    winpane@{ shape: win-pane, label: "Internal storage<br>win-pane" }
    datastore@{ shape: datastore, label: "Data store<br>datastore" }
    bucket@{ shape: bucket, label: "Bucket<br>bucket" }
  end

  subgraph marks [Start, stop and junctions]
    circle@{ shape: circle, label: "Start<br>circle" }
    dblcirc@{ shape: dbl-circ, label: "Stop<br>dbl-circ" }
    subgraph smcircbox ["Small start<br>sm-circ"]
      smcirc@{ shape: sm-circ, label: "Small start" }
    end
    subgraph fcircbox ["Junction<br>f-circ"]
      fcirc@{ shape: f-circ, label: "Junction" }
    end
    subgraph frcircbox ["Framed stop<br>fr-circ"]
      frcirc@{ shape: fr-circ, label: "Framed stop" }
    end
    subgraph crosscircbox ["Summary<br>cross-circ"]
      crosscirc@{ shape: cross-circ, label: "Summary" }
    end
    subgraph forkbox ["Fork or join<br>fork"]
      fork@{ shape: fork, label: "Fork or join" }
    end
    subgraph boltbox ["Communication link<br>bolt"]
      bolt@{ shape: bolt, label: "Communication link" }
    end
  end

  subgraph notes [Notes and things]
    text@{ shape: text, label: "Text block<br>text" }
    brace@{ shape: brace, label: "Comment<br>brace" }
    bracer@{ shape: brace-r, label: "Comment, right<br>brace-r" }
    braces@{ shape: braces, label: "Comment, both sides<br>braces" }
    cloud@{ shape: cloud, label: "Cloud<br>cloud" }
    bang@{ shape: bang, label: "Bang<br>bang" }
    person@{ shape: person, label: "Person<br>person" }
    browser@{ shape: browser, label: "Browser window<br>browser" }
    console@{ shape: console, label: "Console<br>console" }
  end

```
