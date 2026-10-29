# Node shapes

```mermaid
mindmap
  n1(("Node shapes"))
    n2("**Boxes**")
      n3("Rounded")
      n4["Square"]
      n5{{"Hexagon"}}
      Plain text
    n6("**Round**")
      n7(("Circle"))
      n8))"Bang"((
      n9)"Cloud"(
    n10("**Flowchart shapes**")
      n11{"Rhombus"}
      n12(["Stadium"])
      n13[["Subroutine"]]
      n14[("Database")]
      n15((("Double circle")))
      n16>"Flag"]
      n17[/"Parallelogram"/]
      n18[\"Parallelogram alt"\]
      n19[/"Trapezoid"\]
      n20[\"Trapezoid alt"/]
```

## Details

### <a id="n1"></a>Node shapes

Every shape a node can have. Click a node to see how to write it. The centre is a
circle by convention; any node may use any shape.

Boxes and Round are Mermaid's mindmap shapes. Flowchart shapes are Mermaid's other
shapes: a Mermaid mindmap does not have them, so the checker warns, but Avagahana draws
them.

### <a id="n3"></a>Rounded

`n3("Rounded")`: the default for ideas.

### <a id="n4"></a>Square

`n4["Square"]`

### <a id="n5"></a>Hexagon

`n5{{"Hexagon"}}`

### <a id="n2"></a>Boxes

A line with no brackets, like `Plain text`, is a node too: its whole line is the
label and it gets an id of its own, so it cannot have a note or relations.

### <a id="n7"></a>Circle

`n7(("Circle"))`: the centre's shape.

### <a id="n8"></a>Bang

`n8))"Bang"((`

### <a id="n9"></a>Cloud

`n9)"Cloud"(`

### <a id="n10"></a>Flowchart shapes

Mermaid flowchart shapes. Not valid in a Mermaid mindmap; Avagahana draws them anyway.

### <a id="n11"></a>Rhombus

`n11{"Rhombus"}`: a decision.

### <a id="n12"></a>Stadium

`n12(["Stadium"])`

### <a id="n13"></a>Subroutine

`n13[["Subroutine"]]`

### <a id="n14"></a>Database

`n14[("Database")]`: a cylinder.

### <a id="n15"></a>Double circle

`n15((("Double circle")))`

### <a id="n16"></a>Flag

`n16>"Flag"]`: Mermaid calls it asymmetric.

### <a id="n17"></a>Parallelogram

`n17[/"Parallelogram"/]`: input or output.

### <a id="n18"></a>Parallelogram alt

`n18[\"Parallelogram alt"\]`

### <a id="n19"></a>Trapezoid

`n19[/"Trapezoid"\]`

### <a id="n20"></a>Trapezoid alt

`n20[\"Trapezoid alt"/]`
