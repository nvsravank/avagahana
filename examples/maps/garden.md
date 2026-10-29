# Community garden

```mermaid
mindmap
  n1(("Community<br>garden"))
    n2("**Site**")
      ::icon(ph map-pin)
      n3("Sunny corner<br>(six hours of light)")
      ::icon(done)
      n4("Water tap nearby")
      ::icon(ph drop)
      n5["Soil test"]
      ::icon(question)
    n6("**Beds**")
      :::right
      n7("Raised beds")
        n8("Cedar boards")
        n9("Hardware cloth base")
        n10("Drip line")
      n11("Herb spiral")
      ::icon(favorite)
      n12{{"Compost bays"}}
        n13("Green bay")
        n14("Brown bay")
        n15("Finished bay")
    n16("**Crops**")
      n17("Spring")
        n18("Peas")
        n19("Lettuce")
        n20("Radish")
        n21("Spinach")
        n22("Onion sets")
        n23("Broad beans")
        n24("Rocket")
      n25("Summer")
        n26("Tomatoes")
        ::icon(hot)
        n27("Courgettes")
        n28("Beans")
      n29("Autumn")
        n30("Garlic")
        n31("Kale")
    n32("**People**")
      ::icon(people)
      n33("Coordinator")
      ::icon(person thinking)
      n34("Volunteers")
        n35("Weekday rota")
        n36("Weekend rota")
      n37("Neighbours")
      ::icon(link)
    n38("**Budget**")
      ::icon(money)
      n39("Seeds and plants")
      n40("Timber")
      ::icon(status-amber)
      n41("Tools")
      ::icon(flag-red)
```

## Icons

- thinking = ph brain : #7048e8 / #b197fc : Planning
- ph drop : #1c7ed6 / #74c0fc : Water

## Details

### <a id="n5"></a>Soil test

- Send a sample to the extension office
- *pH* and **lead** first
- [How to take a soil sample](<https://example.com/soil-sample>)

### <a id="n11"></a>Herb spiral

A spiral of stone, wet at the bottom and dry at the top. Mint goes low, rosemary high.

### <a id="n33"></a>Coordinator

- Holds the key to the shed
- `rota.xlsx` lives in the shared folder
- Contact: [email](<mailto:garden@example.com>)

### <a id="n37"></a>Neighbours

- [Street newsletter](<https://example.com/newsletter>)

## Relations

- n4 --> n10 : feeds
- n13 --> n7 : compost for
- n35 --> n17 : sows
- n41 --> tools.md#n2 : see the tool list
