The example films on noiraunoir.com/reels/

Drop the films in here named 1.mp4 to 8.mp4. They fill the grid in that
order. A number with no file simply does not appear, and if none of them
are here the whole section stays hidden, so the page is never a row of
broken tiles. To allow more than eight, raise `count` in SHOTS in
reels/index.html.

Vertical or horizontal, both work. The page reads the shape out of the
file: a vertical one takes one slot, a horizontal one takes two and
keeps its own shape, so nothing is ever cropped to fit.

Keep them silent or near enough, and small: they sit in a public repo
and every visitor loads the first frame of each. Eight files of a few
megabytes each is fine, eight of fifty is not.

They are served straight from this folder, so a new file is live about a
minute after it is committed.
