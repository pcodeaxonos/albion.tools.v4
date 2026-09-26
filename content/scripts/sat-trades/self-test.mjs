/**
 * Self-test against the real SAT Trades.json (read-only).
 * Does not modify Trades.json. Watcher "added" logic is exercised via simulateReload.
 *
 * Usage: node scripts/sat-trades/self-test.mjs
 */

import {
    createTradeWatcher,
    findEuropeTradesFile,
    loadLocationDisplayNames,
    normalizeTrades,
    readTradesFile,
    SILVER_SCALE,
    tradeIdentity
} from './index.mjs';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function nearlyEqual(a, b, eps = 1e-9) {
    if (a == null && b == null) {
        return true;
    }
    if (a == null || b == null) {
        return false;
    }
    return Math.abs(Number(a) - Number(b)) <= eps;
}

async function main() {
    const located = findEuropeTradesFile();
    console.log('Trades.json:', located.path);
    console.log('Size:', located.size, 'bytes');
    console.log('Instance:', located.instanceId);

    const { records } = readTradesFile(located.path);
    const locationNames = loadLocationDisplayNames();
    const normalized = normalizeTrades(records, locationNames);

    assert(
        normalized.length === records.length,
        `Normalize count mismatch: input=${records.length} normalized=${normalized.length}`
    );

    const kindCounts = {};
    for (const t of normalized) {
        const k = t.kind || '(null)';
        kindCounts[k] = (kindCounts[k] || 0) + 1;
    }

    // Instant: unit * qty === total
    let instantChecked = 0;
    let instantOk = 0;
    for (let i = 0; i < records.length; i += 1) {
        const raw = records[i];
        const norm = normalized[i];
        if (norm.kind !== 'instant_buy' && norm.kind !== 'instant_sell') {
            continue;
        }
        instantChecked += 1;
        const expected = norm.unitPriceSilver * norm.quantity;
        if (nearlyEqual(expected, norm.totalPriceSilver)) {
            instantOk += 1;
        }
    }

    // Mail: internal total / scale === totalPriceSilver
    let mailChecked = 0;
    let mailOk = 0;
    for (let i = 0; i < records.length; i += 1) {
        const raw = records[i];
        const norm = normalized[i];
        if (raw.Type !== 1 || !raw.MailContent) {
            continue;
        }
        mailChecked += 1;
        const expected = raw.MailContent.InternalTotalPriceWithoutTax / SILVER_SCALE;
        if (nearlyEqual(expected, norm.totalPriceSilver)) {
            mailOk += 1;
        }
    }

    // Player silver
    let playerChecked = 0;
    let playerOk = 0;
    for (let i = 0; i < records.length; i += 1) {
        const raw = records[i];
        const norm = normalized[i];
        if (norm.kind !== 'player_in' && norm.kind !== 'player_out') {
            continue;
        }
        if (!raw.PlayerTradeContent?.IsSilver) {
            continue;
        }
        playerChecked += 1;
        const expected = raw.PlayerTradeContent.InternalSilver / SILVER_SCALE;
        if (nearlyEqual(expected, norm.totalPriceSilver)) {
            playerOk += 1;
        }
    }

    // Instant qty must come from InstantBuySellContent, not AuctionEntry.Amount
    let fillQtyOk = 0;
    let fillQtyChecked = 0;
    for (let i = 0; i < records.length; i += 1) {
        const raw = records[i];
        const norm = normalized[i];
        if (norm.kind !== 'instant_buy' && norm.kind !== 'instant_sell') {
            continue;
        }
        fillQtyChecked += 1;
        if (norm.quantity === raw.InstantBuySellContent?.Quantity) {
            fillQtyOk += 1;
        }
        assert(
            norm.orderAmount === raw.AuctionEntry?.Amount,
            `orderAmount should mirror AuctionEntry.Amount for Id=${raw.Id}`
        );
    }

    // Watcher initial + simulate added (no disk write)
    const initialBatches = [];
    const addedBatches = [];
    const errors = [];

    const watcher = createTradeWatcher({ tradesPath: located.path });
    await watcher.start({
        onInitialTrades(trades) {
            initialBatches.push(trades);
        },
        onTradesAdded(trades) {
            addedBatches.push(trades);
        },
        onError(error) {
            errors.push(error);
        }
    });

    assert(initialBatches.length === 1, 'Expected exactly one initial event');
    assert(
        initialBatches[0].length === records.length,
        `Initial trades length mismatch: ${initialBatches[0].length} vs ${records.length}`
    );
    assert(addedBatches.length === 0, 'No added events expected after start');

    // Simulate reload with same records → no new events
    const none = watcher.simulateReload(records);
    assert(none.length === 0, 'simulateReload with same data should add 0');
    assert(addedBatches.length === 0, 'No added batch after duplicate reload');

    // Fake 3 new trades (in-memory only) with unique Ids
    const fakeNew = [
        {
            Id: 9000000001,
            Type: 1,
            ClusterIndex: '3005',
            Guid: '00000000-0000-0000-0000-000000000001',
            MailTypeText: 'MARKETPLACE_BUYORDER_FINISHED_SUMMARY',
            MailContent: {
                UsedQuantity: 2,
                Quantity: 2,
                UniqueItemName: 'T4_PLANKS',
                InternalTotalPriceWithoutTax: 200000,
                InternalUnitPricePaidWithOverpayment: 100000,
                InternalTotalDistanceFee: 0,
                TaxRate: 0,
                TaxSetupRate: 2.5,
                TaxSetupPrice: { DoubleValue: 0, IntegerValue: 0, InternalValue: 0 }
            },
            Amount: 0,
            AuctionEntry: null,
            InstantBuySellContent: null,
            PlayerTradeContent: null,
            CsvOutput: '2099-01-01T00:00:00.000Z;3005;;Mail;Pine Planks;MARKETPLACE_BUYORDER_FINISHED_SUMMARY;2;2;T4_PLANKS;20;10;0;0;2.5;0;;;;;;;'
        },
        {
            Id: 9000000002,
            Type: 3,
            ClusterIndex: '3005',
            Guid: '00000000-0000-0000-0000-000000000000',
            MailTypeText: null,
            MailContent: null,
            Amount: 0,
            AuctionEntry: {
                Id: 9000000002,
                UnitPriceSilver: 50000,
                TotalDistanceFee: 0,
                TotalPriceSilver: 500000,
                Amount: 10,
                Tier: 4,
                IsFinished: false,
                AuctionType: 'offer',
                HasBuyerFetched: false,
                HasSellerFetched: false,
                SellerCharacterId: null,
                SellerName: 'TestSeller',
                BuyerCharacterId: null,
                BuyerName: null,
                ItemTypeId: 'T4_WOOD',
                ItemGroupTypeId: 'T4_WOOD',
                EnchantmentLevel: 0,
                QualityLevel: 1,
                Expires: '2099-02-01T00:00:00.000Z',
                ReferenceId: 'test-ref'
            },
            InstantBuySellContent: {
                InternalUnitPrice: 50000,
                InternalDistanceFee: 0,
                Quantity: 3,
                TaxRate: 4
            },
            PlayerTradeContent: null,
            CsvOutput: '2099-01-01T00:01:00.000Z;3005;;InstantBuy;Birch Logs;;0;0;;0;0;0;0;0;0;5;0;50;10;4;False;offer;False;False;TestSeller;T4_WOOD;0;1;2099-02-01T00:00:00.000Z;5;3;0;4;;;;;;'
        },
        {
            Id: 9000000003,
            Type: 8,
            ClusterIndex: '3301',
            Guid: '00000000-0000-0000-0000-000000000002',
            MailTypeText: null,
            MailContent: null,
            Amount: 0,
            AuctionEntry: null,
            InstantBuySellContent: null,
            PlayerTradeContent: {
                PartnerName: 'PartnerX',
                Direction: 1,
                IsSilver: true,
                Quantity: 1,
                InternalSilver: 250000000
            },
            CsvOutput: '2099-01-01T00:02:00.000Z;3301;;PlayerTradeOutgoing;Silver;;0;0;;0;0;0;0;0;0;;;PartnerX;Outgoing;True;1;25000'
        }
    ];

    // Ensure fake Ids are not already in the real file
    const existingIds = new Set(records.map((r) => tradeIdentity(r)));
    for (const row of fakeNew) {
        assert(!existingIds.has(tradeIdentity(row)), `Fake Id collides with real data: ${row.Id}`);
    }

    const added = watcher.simulateReload([...records, ...fakeNew]);
    assert(added.length === 3, `Expected 3 added trades, got ${added.length}`);
    assert(addedBatches.length === 1, 'Expected one added batch');
    assert(addedBatches[0].length === 3, 'Added batch should contain 3 trades');
    assert(added[0].kind === 'mail_buy', `expected mail_buy, got ${added[0].kind}`);
    assert(added[1].kind === 'instant_buy', `expected instant_buy, got ${added[1].kind}`);
    assert(added[1].quantity === 3, 'instant fill qty must be Instant.Quantity (3), not Auction.Amount');
    assert(added[1].orderAmount === 10, 'orderAmount should remain Auction.Amount');
    assert(nearlyEqual(added[1].totalPriceSilver, 5 * 3), 'instant total = unit*qty');
    assert(added[2].kind === 'player_out', `expected player_out, got ${added[2].kind}`);
    assert(nearlyEqual(added[2].totalPriceSilver, 25000), 'player silver scale');

    // Second simulate of same fakes → no duplicates
    const again = watcher.simulateReload([...records, ...fakeNew]);
    assert(again.length === 0, 'Duplicate simulate must add 0');

    watcher.stop();
    assert(errors.length === 0, `Unexpected watcher errors: ${errors.map((e) => e.message).join('; ')}`);

    console.log('\n=== Normalize kind distribution ===');
    for (const key of Object.keys(kindCounts).sort()) {
        console.log(`${key}: ${kindCounts[key]}`);
    }

    console.log('\n=== Checks ===');
    console.log(`input === normalized: ${records.length} === ${normalized.length}`);
    console.log(`instant unit*qty === total: ${instantOk}/${instantChecked}`);
    console.log(`mail internalTotal/10000 === total: ${mailOk}/${mailChecked}`);
    console.log(`player InternalSilver/10000 === total: ${playerOk}/${playerChecked}`);
    console.log(`instant quantity from InstantBuySellContent: ${fillQtyOk}/${fillQtyChecked}`);
    console.log('watcher initial event: OK');
    console.log('watcher simulateReload added-only: OK');
    console.log('watcher duplicate suppression: OK');
    console.log('SILVER_SCALE:', SILVER_SCALE);
    console.log('\nALL TESTS PASSED');
}

main().catch((error) => {
    console.error('\nSELF-TEST FAILED');
    console.error(error);
    process.exitCode = 1;
});
