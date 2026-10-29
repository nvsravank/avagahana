# Weather station

```mermaid
mindmap
  n1(("Weather<br>station"))
    n2("**Sensors**")
      :::left
      n3["Thermometer"]
      ::icon(ph thermometer)
      n4["Rain gauge"]
      ::icon(ph drop)
      n5["Anemometer"]
      ::icon(ph wind)
        n6("Cups")
        n7("Vane")
        n8("Reed switch that counts each turn of the cups and sends a pulse to the logger")
    n9("**Power**")
      n10{{"Solar panel"}}
      ::icon(ph sun done)
      n11{{"Battery"}}
      ::icon(status-amber)
      n12))"Brown-out"((
      ::icon(flag-red)
    n13("**Data**")
      n14)"Cloud upload"(
      ::icon(ph cloud-arrow-up)
      n15("Logger")
        n16("Every minute")
          n17("Average")
            n18("Minimum")
            n19("Maximum")
      n20("Local display")
      ::icon(idea favorite question)
    n21("**Site**")
      :::left
      n22("Two metres above grass")
      n23("Away from walls<br>and trees")
```

## Icons

- ph wind : #0B7285 : Wind
- ph cloud-arrow-up : #1971C2 : Upload

## Details

### <a id="n12"></a>Brown-out

The battery runs low on long cloudy spells. The logger keeps its last hour in memory.

### <a id="n15"></a>Logger

- Stores a week of readings
- [Logger manual](<https://example.com/logger>)

## Relations

- n10 --> n11 : charges
- n11 --> n15 : powers
- n5 --> n16 : feeds
