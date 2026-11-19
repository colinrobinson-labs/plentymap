Frozen copies of the listings files, used only by the visual (screenshot) tests so tonight's data refresh
doesn't look like a design change. Refresh them on purpose with:

    cp data/regions/san-diego.json data/regions/index.json qa/fixtures/

then let the visual baselines update (see qa/README.md).
