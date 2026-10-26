"""The two pick rules, shared by the live card, the past cards and the backtest.

  value pick: our final chance beats the fair (no-vig) line by EDGE or more
  our pick:   a value pick that is also high-confidence and not a long underdog
              (settings in config.py: OUR_PICKS_*)
"""
from config import EDGE, OUR_PICKS_MIN_EDGE, OUR_PICKS_MIN_CHANCE, OUR_PICKS_MAX_UNDERDOG, OUR_PICKS_MAX_FAVORITE, OUR_PICKS_ANY_FAVORITE


def value_side(p_final, fair, edge=EDGE):
    """'a', 'b' or None."""
    if p_final is None or fair is None or p_final != p_final or fair != fair:
        return None
    if p_final - fair > edge:
        return "a"
    if fair - p_final > edge:
        return "b"
    return None


def our_side(p_final, fair, odds_a, odds_b):
    """'a', 'b' or None: a value pick that is either 70%+ likely or the betting favorite,
    and not an underdog longer than +150."""
    side = value_side(p_final, fair, OUR_PICKS_MIN_EDGE)
    if side is None:
        return None
    chance = p_final if side == "a" else 1 - p_final
    odds = odds_a if side == "a" else odds_b
    if odds is None or odds != odds:
        return None
    if chance < OUR_PICKS_MIN_CHANCE and not (OUR_PICKS_ANY_FAVORITE and odds < 0):
        return None
    if odds > OUR_PICKS_MAX_UNDERDOG:
        return None
    if OUR_PICKS_MAX_FAVORITE is not None and odds < OUR_PICKS_MAX_FAVORITE:
        return None
    return side


def stake(odds):
    """Suggested units for an our pick at these odds (config.STAKES)."""
    from config import STAKES
    if odds is None or odds != odds:
        return 1.0
    for floor, units in STAKES:
        if odds >= floor:
            return units
    return STAKES[-1][1]


def expert_lean(fair_a, picks_a, picks_b):
    """'a', 'b' or None: a close fight (by the line) where most analysts agree."""
    from config import EXPERT_LEAN, EXPERT_LEAN_MIN_SHARE, EXPERT_LEAN_MIN_ANALYSTS, EXPERT_LEAN_LINE
    if not EXPERT_LEAN or fair_a is None or fair_a != fair_a or picks_a is None or picks_b is None:
        return None
    n = picks_a + picks_b
    if n < EXPERT_LEAN_MIN_ANALYSTS or picks_a == picks_b or not (EXPERT_LEAN_LINE[0] < fair_a < EXPERT_LEAN_LINE[1]):
        return None
    if max(picks_a, picks_b) / n < EXPERT_LEAN_MIN_SHARE:
        return None
    return "a" if picks_a > picks_b else "b"
