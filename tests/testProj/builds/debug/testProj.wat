(module
	(import "std" "print_str" (func $print_str (param i32)))
	(memory (export "memory") 1)
	(data (i32.const 0) "Hello, I am in a loop!\n ")
	(data (i32.const 25) "Nice!!! ")
	(global $memoryTop (mut i32) (i32.const 33))
	(func $initObject (export "initObject") (param $size i32) (result i32)
    (local $fullSize i32)
    local.get $size
    i32.const 4
    i32.mul
    local.set $fullSize

    global.get $memoryTop
    global.get $memoryTop
    local.get $fullSize
    i32.add

    global.set $memoryTop
  )
	(func $Test (param $this i32) (param $y i32) (param $f i32) (result i32)
		(block $funcleave
		local.get $this
		i32.const 0
		i32.add
		local.get $y
		i32.store
		local.get $this
		i32.const 1
		i32.add
		local.get $f
		i32.store
		)
		local.get $this
	)
	(func $print (param $this i32)
		(block $funcleave
		local.get $this
		i32.const 1
		i32.add
		i32.load
		call $print_str
		)
	)
	(func $main (export "main") (param $x i32) (result i32)
		(local $z i32)
		(local $y i32)
		(block $funcleave (result i32)
		(local.set $y (i32.const 0))
		(block $block_0
		(loop $loop_1
		local.get $y
		local.get $x
		i32.lt_s
		i32.const 1
		i32.xor
		br_if $block_0
		i32.const 0
		call $print_str
		local.get $y
		i32.const 1
		i32.add
		(local.set $y)
		br $loop_1
		)
		)
		i32.const 2
		call $initObject
		i32.const 5
		i32.const 25
		(local.set $z (call $Test))
		local.get $z
		call $print
		local.get $z
		br $funcleave
		)
	)
)