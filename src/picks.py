"""The two pick rules, shared by the live card, the past cards and the backtest.

  value pick: our final chance beats the fair (no-vig) line by EDGE or more
  our pick:   a value pick that is also high-confidence and not a long underdog
              (settings in config.py: OUR_PICKS_*)
"""
from config import EDGE, OUR_PICKS_MIN_EDGE, OUR_PICKS_MIN_CHANCE, OUR_PICKS_MAX_UNDERDOG, OUR_PICKS_MAX_FAVORITE


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
    """'a', 'b' or None: value pick + high confidence + sensible price."""
    side = value_side(p_final, fair, OUR_PICKS_MIN_EDGE)
    if side is None:
        return None
    chance = p_final if side == "a" else 1 - p_final
    odds = odds_a if side == "a" else odds_b
    if odds is None or odds != odds or chance < OUR_PICKS_MIN_CHANCE:
        return None
    if odds > OUR_PICKS_MAX_UNDERDOG:
        return None
    if OUR_PICKS_MAX_FAVORITE is not None and odds < OUR_PICKS_MAX_FAVORITE:
        return None
    return side
