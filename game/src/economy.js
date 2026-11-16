// Economy: the money both sides earn and spend between rounds. Kill reward, win and loss
// bonuses, a planting bonus; the buy menu writes loadouts back here.
export const PRICES = {
  smg: 1050, rifle: 2700, marksman: 4300,
  armor: 650, grenade: 300, defuse: 400,
};

export function createEconomy() {
  const teams = {
    strike: { money: 800, grenade: false, armor: 0 },
    warden: { money: 800, grenade: false, armor: 0, defuseKit: false },
  };
  return {
    teams,
    reward(kind, side, win, planted) {
      const t = teams[side];
      if (kind === 'kill') t.money = Math.min(9000, t.money + 300);
      if (kind === 'round') t.money = Math.min(9000, t.money + (win ? 3250 : 1400) + (planted && !win ? 300 : 0));
      if (kind === 'plant') t.money = Math.min(9000, t.money + 300);
    },
    buy(side, item, inventory = teams[side]) {
      const t = teams[side];
      if (item === 'defuse') {
        if (side !== 'warden' || t.defuseKit || t.money < PRICES.defuse) return false;
        t.money -= PRICES.defuse; t.defuseKit = true; return true;
      }
      if (item === 'armor') {
        if (t.armor >= 100 || t.money < PRICES.armor) return false;
        t.money -= PRICES.armor; t.armor = 100; return true;
      }
      if (item === 'grenade') {
        if (inventory.grenade || t.money < PRICES.grenade) return false;
        t.money -= PRICES.grenade; inventory.grenade = true; return true;
      }
      if (PRICES[item] === undefined || t.money < PRICES[item]) return false;
      t.money -= PRICES[item];
      return true;
    },
    newRound(side) {
      // Armour carries over when it survived; guns carry too (losses reset only on death rules
      // the round layer applies). The grenade is single-use per round.
      teams[side].grenade = false;
    },
    reset() {
      teams.strike = { money: 800, grenade: false, armor: 0 };
      teams.warden = { money: 800, grenade: false, armor: 0, defuseKit: false };
    },
  };
}
