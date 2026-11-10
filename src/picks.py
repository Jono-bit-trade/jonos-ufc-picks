"""The two pick rules, shared by the live card, the past cards and the backtest.

  value pick: our final chance beats the fair (no-vig) line by EDGE or more
  our pick:   a value pick that is also high-confidence and not a long underdog
              (settings in config.py: OUR_PICKS_*)
"""
from config import COIN_FLIP, EDGE, OUR_PICKS_MIN_EDGE, OUR_PICKS_MIN_CHANCE, OUR_PICKS_MAX_UNDERDOG, OUR_PICKS_MAX_FAVORITE, OUR_PICKS_ANY_FAVORITE


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


def stake(odds, edge=None):
    """Suggested units for an our pick at these odds (config.STAKES), halved for a model pick whose
    edge over the line is under config.FULL_STAKE_EDGE. edge=None (analyst picks): the full stake."""
    from config import STAKES, FULL_STAKE_EDGE
    if odds is None or odds != odds:
        units = 1.0
    else:
        units = next((u for floor, u in STAKES if odds >= floor), STAKES[-1][1])
    if edge is not None and edge == edge and FULL_STAKE_EDGE and edge < FULL_STAKE_EDGE:
        units = units / 2
    return units


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


def winner_side(p_final, fair, lean=None):
    """The model's predicted winner, 'a' or 'b'. In a coin flip (45-55%) the value side decides it,
    then an expert lean, then the higher chance."""
    if p_final is None or p_final != p_final:
        return lean
    if abs(p_final - 0.5) <= COIN_FLIP and fair is not None and fair == fair:
        v = value_side(p_final, fair)
        if v:
            return v
    return lean or ("a" if p_final > 0.5 else "b")


def tier(p_final):
    """Confidence tier from our final chance for the favored side: High 70%+, Medium 58-70%, Low under 58%."""
    if p_final is None or p_final != p_final:
        return None
    c = max(p_final, 1 - p_final)
    return "High" if c >= 0.70 else "Medium" if c >= 0.58 else "Low"
